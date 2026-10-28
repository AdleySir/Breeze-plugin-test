import type {
  CapabilitiesBundleContract,
  ChapterContentContract,
  ChapterPage,
  ChapterSummary,
  ComicDetailContract,
  CreatorPageAction,
  FetchImageBytesPayload,
  InfoContract,
  LoginBundleContract,
  LoginSubmitPayload,
  LoginSubmitResult,
  ReadSnapshotContract,
  ReadSnapshotPayload,
  SearchComicPayload,
  SearchResultContract,
  SettingsBundleContract,
  StringMap,
  UserInfoBundleContract,
} from "breeze-plugin-kit";
import {
  authConfig,
  buildLoginBundle,
  flutterTools,
  readLoginValues,
  runtime,
} from "breeze-plugin-kit";
import {
  createActionItem,
  createBasicMetadata,
  createComicItem,
  createImage,
  createMetadataActionList,
  PLUGIN_ID,
  toStringMap,
} from "./common";
import { buildPluginInfo } from "./get-info";
import {
  fetchPixivImage,
  getAccessToken,
  getAccountName,
  loginWithPixivPassword,
  PixivIllust,
  pixivGet,
} from "./pixiv-api";

type SearchResponse = {
  illusts?: PixivIllust[];
  next_url?: string | null;
};

type IllustResponse = {
  illust: PixivIllust;
};

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function getTags(illust: PixivIllust): string[] {
  return (illust.tags ?? [])
    .map((tag) => String(tag.translated_name || tag.name || "").trim())
    .filter(Boolean);
}

function createPixivItem(illust: PixivIllust) {
  const id = String(illust.id);
  const user = illust.user ?? {};
  const item = createComicItem(id, String(illust.title ?? "Pixiv作品"));
  item.subtitle = String(user.name ?? "Pixiv");
  item.finished = true;
  item.likesCount = asNumber(illust.total_bookmarks);
  item.viewsCount = asNumber(illust.total_view);
  item.updatedAt = String(illust.create_date ?? "").replace("T", " ").slice(0, 16);
  item.cover = createImage({
    id: id + "-cover",
    url: illust.image_urls?.medium || illust.image_urls?.large || "",
    name: String(illust.title ?? id),
    path: "pixiv/" + id + "/cover",
    extern: { illustId: id },
  });
  item.metadata = [
    createBasicMetadata("author", "作者", [user.name ?? "Pixiv"]),
    createBasicMetadata("tags", "标签", getTags(illust)),
  ];
  item.raw = illust as unknown as StringMap;
  item.extern = { illustId: id };
  return item;
}

function createChapter(illust: PixivIllust): ChapterSummary {
  const id = String(illust.id);
  return {
    id,
    requestId: id,
    logicalKey: id,
    storageChapterId: id,
    name: "作品原图",
    order: 1,
    extern: { pageCount: asNumber(illust.page_count) },
  };
}

function createPages(illust: PixivIllust): ChapterPage[] {
  const id = String(illust.id);
  const metaPages = illust.meta_pages ?? [];
  const urls =
    metaPages.length > 0
      ? metaPages.map((page) => page.image_urls?.original || page.image_urls?.large || "")
      : [illust.meta_single_page?.original_image_url || illust.image_urls?.large || ""];
  return urls
    .map((url, index) => ({ url: String(url).trim(), index }))
    .filter((page) => page.url.length > 0)
    .map((page) => ({
      id: id + "-page-" + String(page.index + 1),
      name: String(page.index + 1) + ".jpg",
      path: "pixiv/" + id + "/" + String(page.index + 1),
      url: page.url,
      extern: { illustId: id, pageIndex: page.index },
    }));
}

function createDetailNormal(illust: PixivIllust) {
  const id = String(illust.id);
  const user = illust.user ?? {};
  const tags = getTags(illust);
  const coverUrl = illust.image_urls?.large || illust.image_urls?.medium || "";
  return {
    comicInfo: {
      id,
      title: String(illust.title ?? "Pixiv作品"),
      titleMeta: [
        createActionItem("收藏 " + String(asNumber(illust.total_bookmarks))),
        createActionItem("浏览 " + String(asNumber(illust.total_view))),
      ],
      creator: {
        id: String(user.id ?? ""),
        name: String(user.name ?? "Pixiv"),
        avatar: createImage({
          id: "user-" + String(user.id ?? ""),
          url: user.profile_image_urls?.medium || "",
          name: String(user.name ?? "Pixiv"),
          path: "pixiv/user/" + String(user.id ?? ""),
          extern: { userId: String(user.id ?? "") },
        }),
        onTap: {} as CreatorPageAction,
        extern: { userId: String(user.id ?? "") },
      },
      description: String(illust.caption ?? ""),
      cover: createImage({
        id: id + "-cover",
        url: coverUrl,
        name: String(illust.title ?? id),
        path: "pixiv/" + id + "/cover",
        extern: { illustId: id },
      }),
      metadata: [
        createMetadataActionList("author", "作者", [user.name ?? "Pixiv"]),
        createMetadataActionList("tags", "标签", tags),
        createMetadataActionList("type", "类型", [illust.type ?? "illust"]),
      ],
      extern: { illustId: id },
    },
    eps: [createChapter(illust)],
    recommend: [],
    totalViews: asNumber(illust.total_view),
    totalLikes: asNumber(illust.total_bookmarks),
    totalComments: asNumber(illust.total_comments),
    isFavourite: Boolean(illust.is_bookmarked),
    isLiked: Boolean(illust.is_bookmarked),
    allowComments: false,
    allowLike: false,
    allowCollected: false,
    allowDownload: true,
    allowCommentsReason: "Pixiv 插件暂未接入评论",
    allowLikeReason: "Pixiv 收藏操作暂未接入",
    allowCollectedReason: "Pixiv 收藏夹管理暂未接入",
    extern: { illustId: id },
  };
}

async function fetchIllust(illustId: string): Promise<PixivIllust> {
  if (!illustId.trim()) throw new Error("作品 ID 不能为空");
  const response = await pixivGet<IllustResponse>("/v1/illust/detail", {
    filter: "for_android",
    illust_id: illustId,
  });
  if (!response.illust) throw new Error("Pixiv 没有返回作品详情");
  return response.illust;
}

async function getInfo(): Promise<InfoContract> {
  return buildPluginInfo();
}

async function searchComic(payload: SearchComicPayload = {}): Promise<SearchResultContract> {
  const keyword = String(payload.keyword ?? "").trim();
  if (!keyword) {
    throw new Error("请输入 Pixiv 搜索关键词");
  }

  const extern = toStringMap(payload.extern);
  const nextUrl = typeof extern.nextUrl === "string" ? extern.nextUrl : "";
  const response = await pixivGet<SearchResponse>(
    nextUrl || "/v1/search/illust",
    nextUrl
      ? {}
      : {
          word: keyword,
          filter: "for_android",
          merge_plain_keyword_results: true,
          include_translated_tag_results: true,
          search_target: "partial_match_for_tags",
          sort: "date_desc",
        },
  );
  const items = (response.illusts ?? []).map(createPixivItem);
  const page = Math.max(1, asNumber(payload.page) || 1);
  const hasNext = Boolean(response.next_url);
  const resultExtern: StringMap = { ...extern };
  if (response.next_url) resultExtern.nextUrl = response.next_url;
  else delete resultExtern.nextUrl;

  const paging = {
    page,
    pages: hasNext ? page + 1 : page,
    total: items.length,
    hasReachedMax: !hasNext,
  };

  return {
    source: PLUGIN_ID,
    extern: resultExtern,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}

async function getComicDetail(
  payload: { comicId?: string; extern?: StringMap } = {},
): Promise<ComicDetailContract> {
  const comicId = String(payload.comicId ?? "").trim();
  const illust = await fetchIllust(comicId);
  return {
    source: PLUGIN_ID,
    comicId,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "comicDetail",
      source: PLUGIN_ID,
    },
    data: {
      normal: createDetailNormal(illust),
      raw: { illust },
    },
  };
}

async function getChapter(
  payload: { comicId?: string; chapterId?: string | number; extern?: StringMap } = {},
): Promise<ChapterContentContract> {
  const comicId = String(payload.comicId ?? "").trim();
  const illust = await fetchIllust(comicId);
  const chapter = createChapter(illust);
  const pages = createPages(illust);
  return {
    source: PLUGIN_ID,
    comicId,
    chapterId: chapter.id,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "chapterContent",
      source: PLUGIN_ID,
    },
    data: {
      comic: {
        id: comicId,
        source: PLUGIN_ID,
        title: String(illust.title ?? "Pixiv作品"),
        extern: { illustId: comicId },
      },
      chapter: { ...chapter, pages },
      chapters: [chapter],
    },
  };
}

async function getReadSnapshot(payload: ReadSnapshotPayload = {}): Promise<ReadSnapshotContract> {
  const comicId = String(payload.comicId ?? "").trim();
  const illust = await fetchIllust(comicId);
  const chapter = createChapter(illust);
  const user = illust.user ?? {};
  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    data: {
      comic: {
        id: comicId,
        source: PLUGIN_ID,
        title: String(illust.title ?? "Pixiv作品"),
        extern: { illustId: comicId, userId: String(user.id ?? "") },
      },
      chapter: { ...chapter, pages: createPages(illust) },
      chapters: [
        {
          id: chapter.id,
          name: chapter.name,
          order: chapter.order,
          extern: chapter.extern,
        },
      ],
    },
  };
}

async function fetchImageBytes({
  url = "",
  timeoutMs = 30000,
  taskGroupKey = "",
}: FetchImageBytesPayload = {}): Promise<Uint8Array<ArrayBufferLike>> {
  if (taskGroupKey && (await runtime.isTaskGroupCancelled(taskGroupKey))) {
    return new Uint8Array(new ArrayBuffer(0));
  }
  return fetchPixivImage(String(url).trim(), timeoutMs);
}

async function getSettingsBundle(): Promise<SettingsBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [],
    },
    data: {
      canShowUserInfo: true,
      canLogin: true,
      loginTitle: "Pixiv 登录",
      loginSubtitle: "使用 Pixiv 账号登录",
      values: {},
    },
  };
}

async function getUserInfoBundle(): Promise<UserInfoBundleContract> {
  const accountName =
    (await getAccountName()) || (await authConfig.load("pixiv.username", ""));
  return {
    source: PLUGIN_ID,
    scheme: { version: "1.0.0", type: "userInfo" },
    data: {
      title: "Pixiv 账号",
      avatar: createImage({
        id: "pixiv-account",
        url: "https://www.pixiv.net/favicon.ico",
        name: accountName || "Pixiv",
        path: "pixiv/account",
        extern: {},
      }),
      lines: [accountName ? "已登录：" + accountName : "尚未登录"],
    },
  };
}

async function getLoginBundle(): Promise<LoginBundleContract> {
  return buildLoginBundle(PLUGIN_ID, {
    title: "Pixiv 登录",
    fields: [
      {
        key: "username",
        kind: "text",
        label: "Pixiv ID / 邮箱",
        required: true,
      },
      {
        key: "password",
        kind: "password",
        label: "密码",
        required: true,
      },
    ],
    submitFnPath: "loginWithPassword",
    submitText: "登录",
    values: { username: await authConfig.load("pixiv.username", "") },
  });
}

async function loginWithPassword(
  payload: LoginSubmitPayload = {},
): Promise<LoginSubmitResult> {
  const values = readLoginValues(payload);
  const username = String(values.username ?? "").trim();
  const password = String(values.password ?? "");
  if (!username || !password) {
    throw new Error("请输入 Pixiv ID / 邮箱和密码");
  }

  const result = await loginWithPixivPassword(username, password);
  await authConfig.save("pixiv.username", username);
  return {
    source: PLUGIN_ID,
    message: "Pixiv 登录成功：" + result.accountName,
  };
}

async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "capabilities",
      actions: [{ key: "test-connection", title: "测试 Pixiv 连接", fnPath: "testPixivConnection" }],
    },
    data: {},
  };
}

async function testPixivConnection(): Promise<Record<string, unknown>> {
  try {
    await getAccessToken(true);
    const accountName = await getAccountName();
    await flutterTools.showToast({
      title: "Pixiv",
      message: accountName ? "连接成功：" + accountName : "Pixiv 令牌刷新成功",
      level: "success",
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await flutterTools.showToast({ title: "Pixiv", message, level: "error" });
    return { ok: false, message };
  }
}

export default {
  getInfo,
  searchComic,
  getComicDetail,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getSettingsBundle,
  getCapabilitiesBundle,
  getUserInfoBundle,
  getLoginBundle,
  loginWithPassword,
  testPixivConnection,
};
