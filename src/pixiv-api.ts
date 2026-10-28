import { buildUnauthorizedError, pluginConfig, requireCryptoLike } from "breeze-plugin-kit";
import { PLUGIN_ID } from "./common";

const APP_API = "https://app-api.pixiv.net";
const OAUTH_API = "https://oauth.secure.pixiv.net/auth/token";
const CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";
const HASH_SALT = "28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c";
const USER_AGENT = "PixivAndroidApp/5.0.155 (Android 10.0; Pixel C)";

export type PixivTag = {
  name?: string;
  translated_name?: string | null;
};

export type PixivIllust = {
  id: number | string;
  title: string;
  type?: string;
  caption?: string;
  create_date?: string;
  page_count?: number;
  total_view?: number;
  total_bookmarks?: number;
  total_comments?: number;
  is_bookmarked?: boolean;
  image_urls?: {
    square_medium?: string;
    medium?: string;
    large?: string;
  };
  meta_single_page?: { original_image_url?: string | null };
  meta_pages?: Array<{
    image_urls?: { original?: string; large?: string; medium?: string };
  }>;
  user?: {
    id?: number | string;
    name?: string;
    profile_image_urls?: { medium?: string };
  };
  tags?: PixivTag[];
  [key: string]: unknown;
};

type PixivTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: number | string; name?: string; account?: string };
};

type PixivApiError = {
  error?: { user_message?: string | null; message?: string | null };
  message?: string;
};

async function readConfig<T>(key: string, fallback: T): Promise<T> {
  const raw = await pluginConfig.load(key, "");
  if (!raw) return fallback;
  try {
    const decoded = JSON.parse(raw) as { value?: T };
    if (decoded && typeof decoded === "object" && "value" in decoded) {
      return decoded.value as T;
    }
    return decoded as T;
  } catch {
    return raw as T;
  }
}

async function writeConfig(key: string, value: unknown): Promise<void> {
  await pluginConfig.save(key, JSON.stringify({ value }));
}

async function clientHeaders(): Promise<Record<string, string>> {
  const clientTime = new Date().toISOString().replace("Z", "+00:00");
  const crypto = requireCryptoLike();
  const clientHash = await crypto.md5(clientTime + HASH_SALT);
  return {
    "X-Client-Time": clientTime,
    "X-Client-Hash": clientHash,
    "App-OS": "Android",
    "App-OS-Version": "10.0",
    "App-Version": "5.0.166",
    "User-Agent": USER_AGENT,
    "Accept-Language": "zh-CN",
  };
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = (await readConfig("pixiv.refreshToken", "")).trim();
  if (!refreshToken) {
    throw buildUnauthorizedError(PLUGIN_ID, "请先登录 Pixiv 账号");
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    Device_token: "pixiv",
    get_secure_url: "true",
    include_policy: "true",
  });

  const response = await fetch(OAUTH_API, {
    method: "POST",
    headers: {
      ...(await clientHeaders()),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  const result = (await response.json().catch(() => ({}))) as PixivTokenResponse &
    PixivApiError;
  if (!response.ok || !result.access_token) {
    const message =
      result.error?.user_message || result.error?.message || result.message || response.statusText;
    if (result.error?.message === "invalid_grant") {
      throw buildUnauthorizedError(PLUGIN_ID, "Pixiv 登录已失效，请重新登录");
    }
    throw new Error("Pixiv 登录失败: " + message);
  }

  if (result.refresh_token) {
    await writeConfig("pixiv.refreshToken", result.refresh_token);
  }
  await writeConfig("pixiv.accessToken", result.access_token);
  await writeConfig(
    "pixiv.accessTokenExpiresAt",
    Date.now() + Math.max(0, Number(result.expires_in ?? 0) - 60) * 1000,
  );
  if (result.user?.name || result.user?.account) {
    await writeConfig("pixiv.accountName", result.user.name || result.user.account || "");
  }
  return result.access_token;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) return refreshAccessToken();

  const token = await readConfig("pixiv.accessToken", "");
  const expiresAt = Number(await readConfig("pixiv.accessTokenExpiresAt", 0));
  if (token && expiresAt > Date.now()) return token;
  return refreshAccessToken();
}

export async function loginWithPixivPassword(
  username: string,
  password: string,
): Promise<{ accountName: string }> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "password",
    username,
    password,
    Device_token: "pixiv",
    get_secure_url: "true",
    include_policy: "true",
  });
  const response = await fetch(OAUTH_API, {
    method: "POST",
    headers: {
      ...(await clientHeaders()),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });
  const result = (await response.json().catch(() => ({}))) as PixivTokenResponse &
    PixivApiError;
  if (!response.ok || !result.access_token || !result.refresh_token) {
    const message =
      result.error?.user_message || result.error?.message || result.message || response.statusText;
    throw new Error("Pixiv 登录失败: " + message);
  }

  await writeConfig("pixiv.refreshToken", result.refresh_token);
  await writeConfig("pixiv.accessToken", result.access_token);
  await writeConfig(
    "pixiv.accessTokenExpiresAt",
    Date.now() + Math.max(0, Number(result.expires_in ?? 0) - 60) * 1000,
  );
  const accountName = String(result.user?.name || result.user?.account || username);
  await writeConfig("pixiv.accountName", accountName);
  return { accountName };
}

async function apiError(response: Response): Promise<Error> {
  const result = (await response.json().catch(() => ({}))) as PixivApiError;
  const message =
    result.error?.user_message || result.error?.message || result.message || response.statusText;
  return new Error("Pixiv 请求失败 (" + response.status + "): " + message);
}

function validateAppApiUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname !== "app-api.pixiv.net") {
    throw new Error("Pixiv 分页地址无效。");
  }
  return url.toString();
}

export async function pixivGet<T>(
  pathOrUrl: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  let url: string;
  if (pathOrUrl.startsWith("https://")) {
    url = validateAppApiUrl(pathOrUrl);
  } else {
    const endpoint = pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl;
    const parsed = new URL(APP_API + endpoint);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") parsed.searchParams.set(key, String(value));
    }
    url = parsed.toString();
  }

  const request = async (accessToken: string): Promise<Response> =>
    fetch(url, {
      headers: {
        ...(await clientHeaders()),
        Authorization: "Bearer " + accessToken,
      },
      signal: AbortSignal.timeout(30000),
    });

  let response = await request(await getAccessToken());
  if (response.status === 401) response = await request(await getAccessToken(true));
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as T;
}

export async function fetchPixivImage(
  input: string,
  timeoutMs = 30000,
): Promise<Uint8Array<ArrayBufferLike>> {
  const url = new URL(input);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".pximg.net")) {
    throw new Error("Pixiv 图片地址无效。");
  }

  const response = await fetch(url.toString(), {
    headers: {
      Referer: "https://www.pixiv.net/",
      "User-Agent": USER_AGENT,
      "x-rquickjs-host-offload-binary-v1": "1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error("Pixiv 图片下载失败 (" + response.status + "): " + response.statusText);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function saveRefreshToken(value: string): Promise<void> {
  await writeConfig("pixiv.refreshToken", value.trim());
  await writeConfig("pixiv.accessToken", "");
  await writeConfig("pixiv.accessTokenExpiresAt", 0);
}

export async function getAccountName(): Promise<string> {
  return readConfig("pixiv.accountName", "");
}

