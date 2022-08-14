export {};
declare global {
  namespace Express {
    interface Request {
      user: string | null;
      login: (username: string) => Promise<void>;
      logout: () => Promise<void>;
    }
  }
}

import * as express from "express";
import { nanoid } from "nanoid";
export interface AuthOptions {
  cookie?: {
    secure?: true;
    maxAge?: number;
    httpOnly?: boolean;
  };
  sessionStore: SessionStore;
}
export interface SessionStore {
  set: (sid: string, user: string) => Promise<void>;
  get: (sid: string) => Promise<string | null>;
  remove: (sid: string) => Promise<void>;
  exists: (sid: string) => Promise<boolean>;
}
export function memStore(): SessionStore {
  const sessions = new Map();
  return {
    set: async (sid, user) => {
      sessions.set(sid, user);
    },
    get: async (sid) => {
      return sessions.has(sid) ? sessions.get(sid) : null;
    },
    remove: async (sid) => {
      sessions.delete(sid);
    },
    exists: async (sid) => {
      return sessions.has(sid);
    },
  };
}

export default function auth(
  options: AuthOptions = { sessionStore: memStore() }
) {
  const auths: {
    [key: string]: (
      req: express.Request,
      res: express.Response
    ) => Promise<string | { message: string } | false>;
  } = {};
  return {
    middleware: async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        req.cookies &&
        req.cookies["token"] &&
        (await options.sessionStore.exists(req.cookies["token"]))
      ) {
        req.user = (await options.sessionStore.get(
          req.cookies["token"]
        )) as string;
      } else req.user = null;
      req.login = async (username) => {
        const token = nanoid(32);
        await options.sessionStore.set(token, username);
        res.cookie("token", token, {
          secure: options.cookie ? options.cookie.secure : false,
          maxAge: options.cookie ? options.cookie.maxAge : 86400,
          httpOnly: options.cookie ? options.cookie.httpOnly : true,
        });
      };
      req.logout = async () => {
        if (req.cookies && req.cookies["token"])
          options.sessionStore.remove(req.cookies.token);
        res.clearCookie("token");
      };
      next();
    },
    addAuth: (
      name: string,
      auth: (
        req: express.Request,
        res: express.Response
      ) => Promise<string | { message: string } | false>
    ) => {
      auths[name] = auth;
    },
    /**
     * Log in a user using an authentication method.
     * @param type The authenticator to use. Has to be registered using addAuth.
     * @param manual Whether you want to handle the response yourself. Otherwise this function will send JSON back.
     * @returns
     */
    authenticate: (type: string, manual: boolean = false) => {
      if (!auths[type])
        throw new Error("Authentication type '" + type + "' does not exist");

      return (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        auths[type](req, res)
          .then(async (username) => {
            if (username === false) {
              // false means that the function handled the response itself
              return next();
            }
            if ((username as any).message) {
              res.status(400);
              res.json({
                type: "error",
                message: (username as any).message,
              });
              return;
            }
            const token = nanoid(32);
            await options.sessionStore.set(token, username as string);
            res.cookie("token", token, {
              secure: options.cookie ? options.cookie.secure : false,
              maxAge: options.cookie ? options.cookie.maxAge : 86400,
              httpOnly: options.cookie ? options.cookie.httpOnly : true,
            });
            if (manual) {
              next();
              return;
            }
            res.json({ type: "success" });
          })
          .catch((err) => {
            res.status(500);
            res.json({
              type: "error",
              message: err.message ?? "Some bad terrible error.",
            });
          });
      };
    },
  };
}
export interface OAuth2Options {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  oauth2Handler: (
    clientId: string,
    clientSecret: string,
    req: express.Request
  ) => Promise<NormalizedProfile>;
  oauth2AccountHandler: (
    profile: NormalizedProfile,
    req: express.Request
  ) => Promise<void>;
}
export function oauth2(
  options: OAuth2Options
): (
  req: express.Request,
  res: express.Response
) => Promise<string | { message: string } | false> {
  return async (req, res) => {
    const normalizedProfile = await options.oauth2Handler(
      options.clientId,
      options.clientSecret,
      req
    );
    await options.oauth2AccountHandler(normalizedProfile, req);
    return false;
  };
}

interface NormalizedProfile {
  username: string;
  bio: string;
  photos: { value: string }[];
  _raw: any;
}
