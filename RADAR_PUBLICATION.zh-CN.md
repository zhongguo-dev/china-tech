# China Dev Radar 发布与归档流程

[English](RADAR_PUBLICATION.md) | **简体中文**

[Zhongguo.dev 技术雷达](https://www.zhongguo.dev/zh/radar)是正式发布渠道。本仓库提供简要双语归档、原始来源链接和社区公告。

## 发布顺序

1. 经审核的 Radar 期刊先在 Zhongguo.dev 正式发布，并包含最终中英文摘要、原始发布日期、来源和规范链接。
2. **Synchronize published Radar archive** GitHub Action 读取仅含已发布期刊的公开数据。通过验证后，生成包含中英文归档、索引和 README 更新的 Pull Request。
3. 维护者审核变更与验证结果，然后合并到 `main`。已归档期刊不会被该流程静默覆盖；内容更正须单独审核。
4. **Announce published Radar editions** Action 再次核对正式发布数据，并检查现有 Discussions，只在 **China Dev Radar** 公告分类为新期刊发布一条双语公告。

正式发布后，可通过 **Actions → Synchronize published Radar archive → Run workflow** 立即准备更新。每天还会执行一次补漏检查（UTC 02:17）。合并归档 PR 后会自动发送公告；独立的每日检查（UTC 02:47）可补发遗漏公告。GitHub 定时执行可能延迟。

## 编辑与来源边界

- 未发布候选、草稿及尚未核实的社区建议不会被导出。
- 正式发布前必须完成 Zhongguo.dev 原有的审核和授权。
- GitHub 归档采用已发布的中英文摘要、相关原始资料和官网全文链接。
- 社区建议仅作为发现线索，可通过[Radar 建议表单](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml)提交。
- 原始发布日期应完整保留，重复运行不得产生重复公告。
- 历史 #001 至 #005 期仅作归档，不会补发旧公告。

## 运行条件

仓库须开启 GitHub Discussions，并具有唯一的 **China Dev Radar** Announcement 类型分类。

若需要自动创建归档 Pull Request，请在仓库 Actions 设置中允许 GitHub Actions 创建 Pull Request。归档与公告工作流分别申请必要的权限。

[公开 Radar 数据接口](https://www.zhongguo.dev/api/radar/public-archive)仅提供已发布内容，不需要任何编辑凭据。

## 异常处理

若正式文章或公开数据暂不可用，归档同步会停止，不会生成不完整的期刊。历史条目发生变化时，需单独审核更正。如无法完整读取 Discussions 历史或确认公告分类，则不会创建公告。

可通过 GitHub Actions 运行记录了解问题，修复后重新运行对应流程。
