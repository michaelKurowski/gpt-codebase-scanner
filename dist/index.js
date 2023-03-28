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
        if (documents.length === 0) {
            throw new Error(dedent `
      Codebase couldn't be processed.
      
      `);
        }
        console.log('Creating vector store...');
        const vectorStore = await HNSWLib.fromDocuments(documents, new OpenAIEmbeddings({
            openAIApiKey: process.env.OPEN_AI_KEY,
        }));
        await vectorStore.save('./vector-store');
        return vectorStore;
    }
}
