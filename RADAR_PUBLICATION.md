# China Dev Radar publication workflow

**English** | [简体中文](RADAR_PUBLICATION.zh-CN.md)

[Zhongguo.dev Radar](https://www.zhongguo.dev/radar) is the canonical publication. This repository provides a concise, source-linked archive and announcement channel.

## Publication sequence

1. An edition is published on Zhongguo.dev, with its final English summaries, original publication dates, citations, and canonical URL.
2. The **Synchronize published Radar archive** GitHub Action checks the public publication feed. Only fully published editions with accessible canonical articles can be added. It prepares a pull request containing the updated archive snapshot, Markdown edition pages, index, and README.
3. A maintainer reviews the pull request and required validation checks, then merges it to `main`. Previously archived editions cannot silently change through this automated path; corrections require a separate review.
4. The **Announce published Radar editions** Action verifies the edition against the live published feed and checks existing Discussions. It posts one announcement per newly archived edition in the **China Dev Radar** announcement category.

After an edition is published on Zhongguo.dev, use **Actions → Synchronize published Radar archive → Run workflow** to prepare the archive update immediately. A daily scheduled check provides a fallback if the manual run is missed (02:17 UTC). Once the archive pull request is merged, the announcement runs automatically on the resulting `main` push. Its separate daily check (02:47 UTC) provides a fallback for missed announcements. GitHub's scheduled runs can be delayed.

## Editorial boundaries

- Community proposals, unreleased editions, drafts, and unverified announcements are never exported through this workflow.
- Publication is decided on Zhongguo.dev before synchronization begins.
- The GitHub archive contains a public excerpt, relevant first-party references, and a link to the canonical bilingual article.
- Community suggestions are discovery leads only. Use the [Radar suggestion form](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml).
- Existing editions remain available under their original publication dates. A re-run must not create a duplicate announcement.
- The five historical editions (#001 through #005) are archived only. The announcement workflow begins with subsequent editions.

## Operational requirements

The repository must have GitHub Discussions enabled with one category named **China Dev Radar**. The announcement category should use the *Announcement* format.

To allow the archive synchronization workflow to open pull requests, enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. The workflow itself requests only the repository permissions required to create its archive PR. The announcement workflow requests Discussions write permission only.

The website must expose its current published Radar content at [the public archive feed](https://www.zhongguo.dev/api/radar/public-archive). The feed contains published content only and requires no submission or editorial credentials.

## When a run stops

If the canonical article or publication feed is unavailable, the archive synchronization stops without proposing a partial edition. If a previously published item changes, the update stops for editorial review instead of overwriting history. If Discussion history cannot be read or a category cannot be identified unambiguously, no announcement is created.

Review GitHub Actions logs to diagnose a failed run. Re-run the corresponding action once the publication and repository configuration have been corrected.
