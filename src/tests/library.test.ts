import test from "ava";
import axios from "axios";
import express, { Application } from "express";
import { Auth, oauth2 } from "../index.js";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import cookieParser from "cookie-parser";
import getPort from "get-port";
import { OAuth2Server } from "oauth2-mock-server";
import { Sequelize, DataTypes } from "sequelize";

function listen(app: Application, port?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    if (port)
      app
        .listen(port, "127.0.0.1")
        .once("listening", () => resolve(port))
        .once("error", reject);
    else
      getPort().then((port) => {
        app
          .listen(port, "127.0.0.1")
          .once("listening", () => resolve(port))
          .once("error", reject);
      });
  });
}

test("dummy authentication", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth("dummy", async (req) => {
    return "test";
  });
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/signin", authentication.authenticate("dummy"));
  const port = await listen(app);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );
  t.is((await instance.get("/")).data, null);

  t.deepEqual((await instance.get("/signin")).data, {
    type: "success",
  });

  t.is((await instance.get("/")).data, "test");
});

test("dummy sign up and sign out", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth("dummy", async (req) => {
    return "test";
  });
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/signin", authentication.authenticate("dummy"));

  app.get("/signout", (req, res) => {
    req.logout().then(() => res.json({ type: "success" }));
  });

  const port = await listen(app);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );
  t.is((await instance.get("/")).data, null);

  t.deepEqual((await instance.get("/signin")).data, {
    type: "success",
  });

  t.is((await instance.get("/")).data, "test");

  t.deepEqual((await instance.get("/signout")).data, {
    type: "success",
  });

  t.is((await instance.get("/")).data, null);
});

test("handle it myself", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth("dummy", async (req) => {
    await req.login("test");
    return false;
  });
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/signin", authentication.authenticate("dummy"));
  const port = await listen(app);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );
  t.is((await instance.get("/")).data, null);

  t.deepEqual((await instance.get("/signin")).data, {
    type: "success",
  });

  t.is((await instance.get("/")).data, "test");
});
test("auth error", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth("dummy-error", async (req) => {
    return { message: "error message" };
  });
  authentication.addAuth("dummy-throw", async (req) => {
    throw new Error("throw message");
  });
  authentication.addAuth("dummy-throw-empty", async (req) => {
    throw new Error();
  });
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/signin", authentication.authenticate("dummy-error"));
  app.get("/signin-throw", authentication.authenticate("dummy-throw"));
  app.get(
    "/signin-throw-empty",
    authentication.authenticate("dummy-throw-empty")
  );

  const port = await listen(app);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );

  t.deepEqual(
    (await instance.get("/signin", { validateStatus: () => true })).data,
    {
      type: "error",
      message: "error message",
    }
  );
  t.deepEqual(
    (await instance.get("/signin-throw", { validateStatus: () => true })).data,
    {
      type: "error",
      message: "throw message",
    }
  );
  t.deepEqual(
    (await instance.get("/signin-throw-empty", { validateStatus: () => true }))
      .data,
    {
      type: "error",
      message: "Some bad terrible error.",
    }
  );
});
test(".authenticate manual", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth("dummy", async (req) => {
    if (req.query.password == "hunter2") return "test";
    else return { message: "Invalid password." };
  });
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/signin", authentication.authenticate("dummy", true), (req, res) => {
    if (req.authError) {
      return res.status(400).json({ type: "err", message: "custom handler" });
    }
    res.json({ type: "custom" });
  });

  const port = await listen(app);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );

  t.deepEqual(
    (
      await instance.get("/signin?password=fish", {
        validateStatus: () => true,
      })
    ).data,
    {
      type: "err",
      message: "custom handler",
    }
  );

  t.deepEqual((await instance.get("/signin?password=hunter2")).data, {
    type: "custom",
  });
});
test("OAuth2", async (t) => {
  let server = new OAuth2Server();
  await server.issuer.keys.generate("RS256");
  const oauthPort = await getPort();
  await server.start(oauthPort, "localhost");

  const port = await getPort();

  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  authentication.addAuth(
    "oauth-mock",
    oauth2({
      oauth2Handler: async (req) => {
        return {
          _raw: {},
          bio: "test",
          photos: [],
          username: "test",
        };
      },
      oauth2AccountHandler: async (profile, req) => {
        await req.login(profile.username);
      },
    })
  );
  app.get("/", (req, res) => {
    res.json(req.user);
  });
  app.get("/oauth", (req, res) =>
    res.redirect(
      "http://localhost:" +
        oauthPort +
        "/authorize?redirect_uri=http://localhost:" +
        port +
        "/oauth/redirect&state=state123&scope=dummy&response_type=code"
    )
  );
  app.get("/oauth/redirect", authentication.authenticate("oauth-mock"));
  await listen(app, port);
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: "http://localhost:" + port.toString(),
    })
  );
  t.is((await instance.get("/")).data, null);

  t.deepEqual((await instance.get("/oauth")).data, {
    type: "success",
  });

  t.is((await instance.get("/")).data, "test");
});

test("authentication type does not exist", async (t) => {
  const authentication = new Auth();
  const app = express();
  app.use(cookieParser());
  app.use(authentication.middleware);
  try {
    app.get("/signin", authentication.authenticate("dummy"));
  } catch (error) {
    t.is((error as any).message, "Authentication type 'dummy' does not exist");
  }
});
