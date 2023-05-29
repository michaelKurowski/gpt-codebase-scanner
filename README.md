# What's this
This is an utility that scans a typescript codebase and allows user to query it using natural language.

# Requirments
- OpenAI API Key
- Node.js

# Usage
Install depdendencies with:
`npm i`

Run it on a codebase with:
`npm start <path to codebase>`

# Examples
```
> npm start ./data/repo/

Vector store exists, loading...


Please ask anything, type "exit" to close:

User: What does this program even do?

AI: Based on the provided code snippets, it seems like a program that builds a simple console-based Snake game in TypeScript. The program defines the game's logic and renderings and includes dependencies on utility functions. It initializes a Board as a 2D Array of 10x10, sets the starting position of the snake, and generates a random location for a food chunk. The snake moves as directed by the user input, and the food chunk generates at a new location as the snake consumes it. When the snake goes beyond the game board, the game ends.

Please ask anything, type "exit" to close:

User: How does the author implement arithmetics?
> 
AI: From the provided code snippets, it seems like the author implements arithmetics in the `./utils/arithmetics.ts` module. This module exports functions like `incrementSingleDigit` and `decrementSingleDigit`, as well as a type `DoubleDigit`. The `decrement` function takes a `DoubleDigit` and decrements it using the `decrementSingleDigit` function. Additionally, the `parseSingleDigit` and `parseDigits` types in the `./utils/typesConversions.ts` module can be used to parse numerical strings into arrays of digits, potentially used in arithmetic operations.
```

# Costs
Please keep in mind that this app uses OpenAPI under the hood. It's my toy project / PoC and I don't take responsibility for the costs of the OpenAPI usage (especially when used on a big codebase). When I've used it on a small-medium project it took more or less 4 USD (march 2023 prices) to scan a codebase. At the time of writing this, there's an option to set a balance limit on the Open AI website. That is to say you use it at your own risk.
