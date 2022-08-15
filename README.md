# hunter2

hunter2 is a minimal, modular authentication library for Express.

## Installation

npm:

```
npm install hunter2
```

yarn:

```
yarn add hunter2
```

## Examples

More advanced examples are in the examples folder.

Very basic example, without any database:

```js
import express from "express";
import cookieParser from "cookie-parser";
import auth from "hunter2";

const app = express();
const port = 3000;
const authentication = auth();
app.use(cookieParser());
app.use(authentication.middleware());

authentication.addAuth("local", async (req, res) => {
  // This function returns an error object {message: "error message"} or the username of who is signed in.
  // Usually this would interact with a DB, but this example will always be logged in as "example-user".
  // Go to the examples/ folder to find integrations with databases.
  return "example-user";
});
app.get("/", (req, res) => {
  if (req.user) res.send(`Hello ${req.user}!`);
  else res.send("Hello World!");
});
app.post(
  "/signin",
  express.urlencoded({ extended: false }),
  authentication.authenticate("local"),
  (req, res) => {
    res.send("Success");
  }
);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
```
