# What's this
This is an utility that scans a typescript codebase and allows user to query it using natural language

# Requirments
- OpenAPI API Key
- Node.js

# Examples
```
> npx ts-node --esm ./index.ts ./data/repo/

Vector store exists, loading...


Please ask anything, type "exit" to close:

User: What does this program even do?

AI: Based on the provided code snippets, it seems like a program that builds a simple console-based Snake game in TypeScript. The program defines the game's logic and renderings and includes dependencies on utility functions. It initializes a Board as a 2D Array of 10x10, sets the starting position of the snake, and generates a random location for a food chunk. The snake moves as directed by the user input, and the food chunk generates at a new location as the snake consumes it. When the snake goes beyond the game board, the game ends.

Please ask anything, type "exit" to close:

User: How does the author implement arithmetics?
> 
AI: From the provided code snippets, it seems like the author implements arithmetics in the `./utils/arithmetics.ts` module. This module exports functions like `incrementSingleDigit` and `decrementSingleDigit`, as well as a type `DoubleDigit`. The `decrement` function takes a `DoubleDigit` and decrements it using the `decrementSingleDigit` function. Additionally, the `parseSingleDigit` and `parseDigits` types in the `./utils/typesConversions.ts` module can be used to parse numerical strings into arrays of digits, potentially used in arithmetic operations.
```