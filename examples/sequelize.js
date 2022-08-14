const express = require("express");
const cookieParser = require("cookie-parser");
const auth = require("../lib/index");
const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize("sqlite::memory:");
const Account = sequelize.define("Account", {
  username: { type: DataTypes.STRING, primaryKey: true },
  password: DataTypes.STRING,
});
Account.sync();
const app = express();
const port = 3000;
const authentication = auth.default();
app.use(cookieParser());
app.use(authentication.middleware);

authentication.addAuth("local", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  const user = await Account.findOne({ where: { username } });

  if (!user) {
    return {
      message: "Incorrect username or password.",
    };
  }

  const ok = await bcrypt.compare(password, user.password);
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
Hello World!<br/> Signup form: <form action="/signup" method="POST">Username <input type="text" name="username"><br/>Password <input type="password" name="password"><br/><input type="submit"></form>
	<br/>
  Login form: <form action="/signin" method="POST">Username <input type="text" name="username"><br/>Password <input type="password" name="password"><br/><input type="submit"></form>
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
app.post("/signup", express.urlencoded({ extended: false }), (req, res) => {
  if (req.user) {
    res.status(400);
    res.send("already signed in");
    return;
  }
  const username = req.body.username;
  if (!/^[a-z][a-zA-Z0-9_]*$/g.test(username)) {
    res.status(400);
    res.json({
      type: "error",
      message:
        "invalid username; must start with a letter and cannot contain spaces or dashes",
    });
    return;
  }
  const password = req.body.password;
  /// IMPORTANT
  /// This example stores passwords in plain text. DO NOT DO THIS! This is terrible for security and only acceptable because of how basic this is.
  /// For secure password storage, read SECURITY.md.
  /// IMPORTANT
  Account.findByPk(username).then((user) => {
    if (user != null) {
      res.status(400);
      res.json({ type: "error", message: "username taken" });
      return;
    }
    Account.create({
      username,
      password: password,
    }).then((created) => {
      req.login(username).then(() => {
        res.send({ type: "success" });
      });
    });
  });
  res.redirect("/");
});
app.get("/signout", (req, res) => {
  req.logout().then(() => {
    res.redirect("/");
  });
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
