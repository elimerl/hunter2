export {};
declare global {
  namespace Express {
    interface Request {
      user: string | null;
      authError?: string;
      login: (username: string) => Promise<void>;
      logout: () => Promise<void>;
    }
  }
}

import * as express from "express";
import { nanoid } from "nanoid";
/**
 * Config for {@link Auth}.
 */
export interface AuthOptions {
  /** Passed to res.cookie. */
  cookie?: {
    secure?: true;
    maxAge?: number;
    httpOnly?: boolean;
  };
  /** The session store to use.
   * @see {@link SessionStore}
   */
  sessionStore: SessionStore;
}
export interface SessionStore {
  /** Set the session ID for a user. */
  set: (sid: string, user: string) => Promise<void>;
  /** Get the user from a session ID. */
  get: (sid: string) => Promise<string | null>;
  /** Removes a session ID. */
  remove: (sid: string) => Promise<void>;
  /** Check if a session ID exists. */
  exists: (sid: string) => Promise<boolean>;
}
/**
 * A function that creates an in-memory store for sessions. Don't use in production.
 * @returns A session store that you should pass in AuthOptions.
 */
export function memStore(): SessionStore {
  const sessions = new Map();
  return {
    set: async (sid, user) => {
      sessions.set(sid, user);
    },
    get: async (sid) => {
      /* c8 ignore next */
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
/**
 * A handler for an authentication type.
 * @see `addAuth` for the returned data structure
 */
export type AuthHandler = (
  req: express.Request
) => Promise<string | { message: string } | false>;

/**
 * The main class that handles sessions and authentication. Each application should have one of these.
 *
 * @example
 * ```
 * const auth = new Auth();
 * // cookie parser is needed and needs to be before you .use this
 * app.use(cookieParser());
 * app.use(auth.middleware)
 * ```
 */
export class Auth {
  private options: AuthOptions;
  private auths: {
    [key: string]: AuthHandler;
  } = {};
  /**
   * Creates an instance of the Auth class.
   * @param options The options to use. Defaults to an in memory session store. You should use a real session store in production, because in memory stores will not scale across processes and log everybody out when the server restarts.
   */
  constructor(options: AuthOptions = { sessionStore: memStore() }) {
    this.options = options;
  }
  /**
   * app.use this.
   * @example
   * ```ts
   * // cookie parser is needed and needs to be before you .use this
   * app.use(cookieParser());
   * app.use(auth.middleware())
   * ```
   *
   * @see {@link https://www.npmjs.com/package/cookie-parser} needs to be used before this is used.
   */
  middleware() {
    return (async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        req.cookies &&
        req.cookies["token"] &&
        (await this.options.sessionStore.exists(req.cookies["token"]))
      ) {
        req.user = (await this.options.sessionStore.get(
          req.cookies["token"]
        )) as string;
      } else req.user = null;
      req.login = async (username) => {
        const token = nanoid(32);
        await this.options.sessionStore.set(token, username);
        res.cookie("token", token, {
          /* c8 ignore next 3 */
          secure: this.options.cookie ? this.options.cookie.secure : false,
          maxAge: this.options.cookie ? this.options.cookie.maxAge : 86400,
          httpOnly: this.options.cookie ? this.options.cookie.httpOnly : true,
        });
      };
      req.logout = async () => {
        if (req.cookies && req.cookies["token"])
          this.options.sessionStore.remove(req.cookies.token);
        res.clearCookie("token");
      };
      return next();
    }).bind(this);
  }
  /**
   * Register an authentication method.
   * @param name The name of the authentication method.
   * @param auth The authentication method.
   */
  addAuth(name: string, auth: AuthHandler) {
    this.auths[name] = auth;
  }
  /**
   * Middleware to sign in a user.
   * @example
   * ```
   * app.post("/signin", express.urlencoded({ extended: false }), authentication.authenticate("local"));
   * ```
   * @param type The authenticator to use. Has to be registered using addAuth.
   * @param manual Whether you want to handle the response yourself. Otherwise this function will send JSON back.
   * @returns
   */
  authenticate(type: string, manual: boolean = false) {
    if (!this.auths[type])
      throw new Error("Authentication type '" + type + "' does not exist");

    return (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      this.auths[type](req)
        .then(async (username) => {
          if ((username as any).message) {
            if (manual) {
              req.authError = (username as any).message;
              return next();
            }
            res.status(400);
            return res.json({
              type: "error",
              message: (username as any).message,
            });
          }
          // false means that the function set cookies itself
          if (username !== false) {
            await req.login(username as string);
          }
          if (manual) {
            return next();
          }
          return res.json({ type: "success" });
        })
        .catch((err) => {
          res.status(500);
          return res.json({
            type: "error",
            message:
              err.message && err.message !== ""
                ? err.message
                : "Some bad terrible error.",
          });
        });
    };
  }
}
export interface OAuth2Options {
  /** A function that returns a profile fetched from the service. */
  oauth2Handler: (req: express.Request) => Promise<NormalizedProfile>;
  /** Should sign in to the OAuth account if it exists, or create it if it doesn't. */
  oauth2AccountHandler: (
    profile: NormalizedProfile,
    req: express.Request
  ) => Promise<void>;
}
/**
 * A basic handler for OAuth2, except the user does most of the work.
 * @param options The configuration to use.
 * @returns An auth handler.
 *
 * @example
 * Github example (will not work without full setup)
 * ```ts
 * const clientId = "<CLIENT_ID>";
 * const clientSecret = "<CLIENT_ID>";
 * authentication.addAuth(
    "github",
    oauth2({
        oauth2Handler: async (req) => {
            const { data: at_data } = await axios({
                url: `https://github.com/login/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&code=${req.query.code}`,
                method: "POST",
                headers: { Accept: "application/json" },
            });
            const profile = await axios.get("https://api.github.com/user", {
                headers: {
                    Authorization: "token " + at_data.access_token,
                    Accept: "application/vnd.github+json",
                },
            });
            return {
                username: profile.data.login,
                bio: profile.data.bio,
                photos: [
                    {
                        value:
                            "https://github.com/" + profile.data.login + ".png",
                    },
                ],
                _raw: profile.data,
            };
        },
        oauth2AccountHandler: async (profile, req) => {
            // Handle either sign in or sign up here.
            // profile is what was returned from oauth2Handler.
        },
    })
);

app.get("/oauth/github", (req, res) => {
    res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=http://localhost:3000/oauth/github/redirect`
    );
});

app.get(
    "/oauth/github/redirect",
    authentication.authenticate("github"),
    function (req, res) {
        res.redirect("/");
    }
);
```
 */
export function oauth2(options: OAuth2Options): AuthHandler {
  return async (req) => {
    const normalizedProfile = await options.oauth2Handler(req);
    await options.oauth2AccountHandler(normalizedProfile, req);
    return false;
  };
}

export interface NormalizedProfile {
  /** The username of the user. */
  username: string;
  /** The user's bio, if any. */
  bio: string;
  /** A list of photos. If possible, photos[0] should be the user's profile picture. */
  photos: { value: string }[];
  /** The raw profile you got from the OAuth2 API. */
  _raw: any;
}
