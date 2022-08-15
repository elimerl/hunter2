/// IMPORTANT
/// This example stores passwords in plain text. DO NOT DO THIS! This is terrible for security and only acceptable because of how basic this example is.
/// For secure password storage, read SECURITY.md.
/// IMPORTANT

import express, { urlencoded } from "express";
import cookieParser from "cookie-parser";
import { Auth } from "../lib/index.js";
import { Sequelize, DataTypes } from "sequelize";

const sequelize = new Sequelize("sqlite::memory:");
const Account = sequelize.define("Account", {
  username: { type: DataTypes.STRING, primaryKey: true },
  password: DataTypes.STRING,
});
Account.sync();

const app = express();
const port = 3000;
const authentication = auth();
app.use(cookieParser());
app.use(authentication.middleware);

authentication.addAuth("local", async (req) => {
  const username = req.body.username;
  const password = req.body.password;

  const user = await Account.findOne({ where: { username } });

  if (!user) {
    return {
      message: "Incorrect username or password.",
    };
  }

  const ok = password === user.password;
  if (ok) {
    return username;
  } else {
    return {
      message: "Incorrect username or password.",
    };
  }
});
app.get("/", (req, res) => {
  if (req.user)
    return res.send(`
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
    return res.send(
      `
      <!DOCTYPE html>
<html>
<head>
	<meta charset='utf-8'>
</head>
<body>
To test: sign up, then sign out, then sign in.<br/>Don't put any real passwords here, <a href="https://jojozhuang.github.io/architecture/how-to-store-passwords-in-a-secure-way/">THEY ARE STORED IN PLAINTEXT.</a> (read that article)<br/> Signup form: <form action="/signup" method="POST">Username <input type="text" name="username"><br/>Password <input type="password" name="password"><br/><input type="submit"></form>
	<br/>
  Login form: <form action="/signin" method="POST">Username <input type="text" name="username"><br/>Password <input type="password" name="password"><br/><input type="submit"></form>
  </body>
</html>`
    );
});
app.post(
  "/signin",
  urlencoded({ extended: false }),
  authentication.authenticate("local", true),
  (req, res) => {
    if (req.authError) {
      res.send(req.authError);
    }
    return res.redirect("/");
  }
);
app.post("/signup", urlencoded({ extended: false }), (req, res) => {
  if (req.user) {
    res.status(400);
    return res.send("already signed in");
  }
  const username = req.body.username;
  if (!/^[a-z][a-zA-Z0-9_]*$/g.test(username)) {
    res.status(400);
    return res.send(
      "invalid username; must start with a letter and cannot contain spaces or dashes"
    );
  }
  const password = req.body.password;

  Account.findByPk(username).then((user) => {
    if (user != null) {
      res.status(400);
      return res.send("username taken");
      return;
    }
    Account.create({
      username,
      password: password,
    }).then((created) => {
      req.login(username).then(() => {
        return res.redirect("/");
      });
    });
  });
});
app.get("/signout", (req, res) => {
  req.logout().then(() => {
    res.redirect("/");
  });
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
