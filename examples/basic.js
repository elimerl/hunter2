// import express from "express";
// import cookieParser from "cookie-parser";
// import auth from "../lib/index";
// using require:
const express = require("express");
const cookieParser = require("cookie-parser");
const auth = require("../lib/index");

const app = express();
const port = 3000;
const authentication = auth.default();
app.use(cookieParser());
app.use(authentication.middleware);

authentication.addAuth("local", async (req, res) => {
  // This function returns an object {message: "error message"} or the username of who is signed in.
  // Usually this would interact with a DB, but this example will always be logged in as "example-user"
  return "example-user";
});
app.get("/", (req, res) => {
  if (req.user)
    res.send(`
  <!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
</head>
<body>
Hello ${req.user}!<br/> Sign out: <form action="/signout" method="GET"><input type="submit"></form>

</body>
</html>`);
  else
    res.send(
      `
      <!DOCTYPE html>
<html>
<head>
	<meta charset='utf-8'>
</head>
<body>
Hello World!<br/> Login form: <form action="/signin" method="POST"><input type="submit"></form>
	
</body>
</html>`
    );
});
app.post(
  "/signin",
  express.urlencoded({ extended: false }),
  authentication.authenticate("local", true),
  (req, res) => {
    res.redirect("/");
  }
);
app.get("/signout", (req, res) => {
  req.logout().then(() => {
    res.redirect("/");
  });
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
