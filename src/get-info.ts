import type { InfoContract } from "breeze-plugin-kit";
import { PLUGIN_ID } from "./common";

export function buildPluginInfo(): InfoContract {
  return {
    name: "Pixiv",
    uuid: PLUGIN_ID,
    iconUrl: "https://www.pixiv.net/favicon.ico",
    describe: "在 Breeze 中搜索、浏览和阅读 Pixiv 插画与漫画。",
    version: "0.1.0",
    home: "https://github.com/AdleySir/Breeze-plugin-test",
    updateUrl: "https://api.github.com/repos/AdleySir/Breeze-plugin-test/releases/latest",
    function: [],
  };
}

export function buildManifestInfo(): InfoContract {
  return buildPluginInfo();
}
