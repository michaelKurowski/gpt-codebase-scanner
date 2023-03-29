import * as dotenv from 'dotenv';
import fs from 'node:fs';
import { TextLoader } from "langchain/document_loaders";
import { ChatOpenAI } from "langchain/chat_models";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { HNSWLib } from "langchain/vectorstores";
import dedent from 'dedent';
import { HumanChatMessage, SystemChatMessage } from 'langchain/schema';
import ts from 'typescript';
import meow from 'meow';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { OpenAI } from 'langchain';
import { Document } from 'langchain/document';
dotenv.config();
if (!process.env.OPEN_AI_KEY?.length) {
    throw new Error("OpenAI API Key is not set");
}
const USAGE = dedent `
Usage:
  $ code-query <path to repository>

Options:
  --clear-cache, -c         Clears cache
`;
const cli = meow(USAGE, {
    importMeta: import.meta,
    flags: {
        clearCache: {
            type: 'boolean',
            alias: 'c'
        }
    }
});
const codebaseDirectory = cli.input[0];
if (!codebaseDirectory) {
    console.error(dedent `
    No file path provided. Please provide a path to a codebase.
    ${USAGE}
  `);
    process.exit(1);
}
if (cli.flags.clearCache) {
    console.log('Clearing cache...');
    try {
        fs.rmSync('./vector-store', { recursive: true });
    }
    catch (err) {
        throw new Error(`Failed to clear cache: ${err}`);
    }
}
const vectorStore = await loadVectorStore(codebaseDirectory);
const chat = new ChatOpenAI({
    openAIApiKey: process.env.OPEN_AI_KEY,
    modelName: "gpt-3.5-turbo"
});
const rl = readline.createInterface({ input, output });
while (true) {
    const answer = await rl.question('\n\nPlease ask anything, type "exit" to close:\n\nUser: ');
    if (answer === 'exit') {
        console.log('\n\nBye');
        rl.close();
        process.exit(0);
    }
    const resultOne = await vectorStore.similaritySearch(answer, 3);
    const response = await chat.call([
        new SystemChatMessage(`You're an AI. You answer questions about codebase and draw mermaid diagrams. The codebase has been already scanned and relevant code snippets have been prepared for you. This is the relevant data for the user's question: \n${resultOne.map(x => JSON.stringify(x))}`),
        new HumanChatMessage(answer),
    ]);
    console.log(`\nAI: ${response.text}`);
}
async function loadVectorStore(repositoryPath) {
    try {
        fs.accessSync('./vector-store', fs.constants.F_OK);
        console.log('Vector store exists, loading...');
        return HNSWLib.load('./vector-store', new OpenAIEmbeddings({
            openAIApiKey: process.env.OPEN_AI_KEY,
        }));
    }
    catch (err) {
        const resolvedPath = path.resolve(repositoryPath);
        console.log('Vector store does not exist, creating...');
        console.log('Loading data from', resolvedPath, '...');
        const documents = await createDocumentsFromTsCodebase(resolvedPath);
        if (documents.length === 0) {
            throw new Error(dedent `
      Codebase couldn't be processed.
      
      `);
        }
        console.log('Creating vector store...');
        // It sometimes may happen that AI will get a hiccup and output an empty document
        // langchain doesn't handle it properly, so we need to filter out empty documents
        const normalizedDocuments = documents
            .filter(document => document.pageContent.length > 0);
        const vectorStore = await (HNSWLib.fromDocuments(normalizedDocuments, new OpenAIEmbeddings({
            openAIApiKey: process.env.OPEN_AI_KEY,
            batchSize: 5,
            maxRetries: 5
        })).catch(err => {
            fs.writeFileSync('./error.json', JSON.stringify(err, null, 2));
            throw new Error('Failed to create vector store', { cause: err });
        }));
        await vectorStore.save('./vector-store');
        return vectorStore;
    }
}
async function createDocumentsFromTsCodebase(resolvedPath) {
    const configPath = ts.findConfigFile(resolvedPath, ts.sys.fileExists, 'tsconfig.json');
    console.log(`tsconfig located at ${configPath}`);
    if (!configPath) {
        throw new Error('Could not find a valid tsconfig.json.');
    }
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
        throw new Error(dedent `
      Errors while parsing tsconfig.
      ${configFile.error.messageText}
    `);
    }
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath), {}, configPath);
    console.log('Parsing codebase...');
    const program = ts.createProgram({
        rootNames: parsedConfig.fileNames,
        options: parsedConfig.options
    });
    const codebaseMapping = program.getSourceFiles()
        .filter(file => !file.fileName.includes('node_modules'))
        .map(sourceFile => {
        return (new TextLoader(sourceFile.fileName)).loadAndSplit();
    });
    const documents = (await Promise.all(codebaseMapping)).flatMap(x => x);
    const summarizationModel = new OpenAI({
        openAIApiKey: process.env.OPEN_AI_KEY,
        temperature: 0,
        // Seems like langchain doesn't have a neat tool to handle
        // OpenAI's rate limiting
        maxConcurrency: 3,
        maxRetries: 5
    });
    try {
        fs.accessSync('./documents/documents.json', fs.constants.F_OK);
        console.log('Analysis cache exists.');
        console.log('Analysis cache loading...');
        const cachedDocuments = fs.readFileSync('./documents/documents.json', 'utf-8');
        const parsedCachedDocuments = JSON.parse(cachedDocuments);
        return parsedCachedDocuments;
    }
    catch (err) {
        // This costs money, if you fork this code
        // you should weight how much do you want it
        console.log('Codebase analysis, this process may take a while...');
        let progress = 0;
        const summarization = documents.map(async (document) => {
            const summary = await summarizationModel.call(`Write a summary for the following file [${document.metadata.source}]: ${document.pageContent}`);
            const summarizedDocument = new Document({
                pageContent: summary,
                metadata: {
                    source: document.metadata.source
                }
            });
            progress++;
            console.log(`${progress}/${documents.length} chunks...`);
            return summarizedDocument;
        });
        const summaries = await Promise.all(summarization);
        const allDocuments = [
            ...documents,
            ...summaries
        ];
        const stringifiedDocuments = JSON.stringify(allDocuments, null, 2);
        console.log('Saving analysis results...');
        try {
            fs.accessSync('./documents', fs.constants.F_OK);
        }
        catch (err) {
            fs.mkdirSync('./documents', { recursive: true });
        }
        fs.writeFileSync('./documents/documents.json', stringifiedDocuments);
        console.log('Analysis results saved.');
        return allDocuments;
    }
}
