import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { hashToken } from "./tokens";

type TokenAuthResult = { user: Doc<"users">; userId: Doc<"users">["_id"] };
type ApiTokenDoc = Doc<"apiTokens">;
type PackagePublishTokenAuthResult = {
  kind: "github-actions";
  publishToken: Doc<"packagePublishTokens">;
};
type PackagePublishTokenDoc = Doc<"packagePublishTokens">;
type UserPackagePublishAuthResult = {
  kind: "user";
  user: Doc<"users">;
  userId: Doc<"users">["_id"];
};

const internalRefs = internal as unknown as {
  tokens: {
    getByHashInternal: unknown;
    getUserForTokenInternal: unknown;
    touchInternal: unknown;
  };
  packagePublishTokens: {
    getByHashInternal: unknown;
    touchInternal: unknown;
  };
};

export async function requireApiTokenUser(
  ctx: ActionCtx,
  request: Request,
): Promise<TokenAuthResult> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = parseBearerToken(header);
  if (!token) throw new ConvexError("Unauthorized");

  const tokenHash = await hashToken(token);
  const apiToken = (await ctx.runQuery(
    internalRefs.tokens.getByHashInternal as never,
    {
      tokenHash,
    } as never,
  )) as ApiTokenDoc | null;
  if (!apiToken || apiToken.revokedAt) throw new ConvexError("Unauthorized");

  const user = (await ctx.runQuery(
    internalRefs.tokens.getUserForTokenInternal as never,
    {
      tokenId: apiToken._id,
    } as never,
  )) as Doc<"users"> | null;
  if (!user || user.deletedAt || user.deactivatedAt) throw new ConvexError("Unauthorized");

  await ctx.runMutation(
    internalRefs.tokens.touchInternal as never,
    { tokenId: apiToken._id } as never,
  );
  return { user, userId: user._id };
}

export async function getOptionalApiTokenUserId(
  ctx: ActionCtx,
  request: Request,
): Promise<Doc<"users">["_id"] | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = parseBearerToken(header);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const apiToken = (await ctx.runQuery(
    internalRefs.tokens.getByHashInternal as never,
    {
      tokenHash,
    } as never,
  )) as ApiTokenDoc | null;
  if (!apiToken || apiToken.revokedAt) return null;

  const user = (await ctx.runQuery(
    internalRefs.tokens.getUserForTokenInternal as never,
    {
      tokenId: apiToken._id,
    } as never,
  )) as Doc<"users"> | null;
  if (!user || user.deletedAt || user.deactivatedAt) return null;

  return user._id;
}

export async function requirePackagePublishAuth(
  ctx: ActionCtx,
  request: Request,
): Promise<UserPackagePublishAuthResult | PackagePublishTokenAuthResult> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = parseBearerToken(header);
  if (!token) throw new ConvexError("Unauthorized");

  const tokenHash = await hashToken(token);
  const publishToken = (await ctx.runQuery(
    internalRefs.packagePublishTokens.getByHashInternal as never,
    {
      tokenHash,
    } as never,
  )) as PackagePublishTokenDoc | null;
  if (publishToken && !publishToken.revokedAt && publishToken.expiresAt > Date.now()) {
    await ctx.runMutation(
      internalRefs.packagePublishTokens.touchInternal as never,
      {
        tokenId: publishToken._id,
      } as never,
    );
    return { kind: "github-actions", publishToken };
  }

  const auth = await requireApiTokenUser(ctx, request);
  return { kind: "user", user: auth.user, userId: auth.userId };
}

const EXPORT_ALLOWED_ROLES: string[] = ["admin", "moderator", "mirror"];

/**
 * Export 接口鉴权（方案留白）。
 * 当前实现：如果提供了 Bearer token，则验证 token 并检查角色；
 * 如果未提供 token，直接放行（便于开发阶段测试）。
 * 后续可替换为强制鉴权。
 */
export async function requireExportAuth(
  ctx: ActionCtx,
  request: Request,
): Promise<
  | { ok: true; user: Doc<"users"> | null; userId: Doc<"users">["_id"] | null }
  | { ok: false; response: Response }
> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return { ok: true, user: null, userId: null };
  }

  try {
    const { user, userId } = await requireApiTokenUser(ctx, request);

    if (!user.role || !EXPORT_ALLOWED_ROLES.includes(user.role)) {
      return {
        ok: false,
        response: new Response("Forbidden: export permission required", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        }),
      };
    }

    return { ok: true, user, userId };
  } catch (err) {
    return {
      ok: false,
      response: new Response(
        `Unauthorized: ${err instanceof Error ? err.message : "invalid token"}`,
        { status: 401, headers: { "Content-Type": "text/plain" } },
      ),
    };
  }
}

export function parseBearerToken(header: string | null) {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}
