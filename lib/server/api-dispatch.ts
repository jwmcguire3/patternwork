import type { NextRequest } from "next/server";

export type ApiMethod = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH";
export type ApiRouteParams = Readonly<Record<string, string>>;
export type ApiRouteHandler = (request: NextRequest, params: ApiRouteParams) => Response | Promise<Response>;
export type ApiRouteDefinition = {
  pattern: readonly string[];
  handlers: Partial<Record<ApiMethod, ApiRouteHandler>>;
};
export type ApiCatchAllContext = {
  readonly params: Promise<{ readonly path: string[] }>;
};

type ParamContext<T extends Record<string, string>> = {
  readonly params: Promise<T>;
};

export function withApiParams<T extends Record<string, string>>(
  handler: (request: NextRequest, context: ParamContext<T>) => Response | Promise<Response>,
): ApiRouteHandler {
  return (request, params) => handler(request, { params: Promise.resolve(params as T) });
}

function findRoute(
  routes: readonly ApiRouteDefinition[],
  path: readonly string[],
): { route: ApiRouteDefinition; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.pattern.length !== path.length) continue;

    const params: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < route.pattern.length; index += 1) {
      const expected = route.pattern[index];
      const actual = path[index];
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = actual;
      } else if (expected !== actual) {
        matches = false;
        break;
      }
    }

    if (matches) return { route, params };
  }

  return undefined;
}

function allowedMethods(route: ApiRouteDefinition): string {
  const implemented = Object.keys(route.handlers);
  const allow = ["OPTIONS", ...implemented];
  if (!route.handlers.HEAD && route.handlers.GET) allow.push("HEAD");
  return allow.sort().join(", ");
}

export function createApiDispatcher(routes: readonly ApiRouteDefinition[]) {
  return async function dispatch(request: NextRequest, context: ApiCatchAllContext): Promise<Response> {
    const { path } = await context.params;
    const match = findRoute(routes, path);
    if (!match) return new Response(null, { status: 404 });

    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { Allow: allowedMethods(match.route) },
      });
    }

    const handler = method === "HEAD"
      ? match.route.handlers.HEAD ?? match.route.handlers.GET
      : match.route.handlers[method as ApiMethod];
    if (!handler) return new Response(null, { status: 405 });
    return handler(request, match.params);
  };
}
