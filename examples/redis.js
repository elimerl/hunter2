import express, { urlencoded } from "express";
import cookieParser from "cookie-parser";
import { Auth } from "../lib/index.js";
import { createClient } from "redis";

const app = express();
const port = 3000;
const client = createClient();
client.connect();
const redisStore = (client) => {
  return {
    set: async (sid, user) => {
      await client.set(sid, user);
    },
    get: async (sid) => {
      return (await client.exists(sid)) ? await client.get(sid) : null;
    },
    remove: async (sid) => {
      await client.del(sid);
    },
  };
};
const authentication = new Auth({
  sessionStore: redisStore(client),
});
app.use(cookieParser());
app.use(authentication.middleware());

authentication.addAuth("local", async (req) => {
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
  urlencoded({ extended: false }),
  authentication.authenticate("local", true),
  (req, res) => {
    if (req.authError) {
      res.send(req.authError);
    }
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
