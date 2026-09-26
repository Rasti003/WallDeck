import type { ViewId, WallDeckSettings } from "@walldeck/contracts";

type RouterSettings = WallDeckSettings["viewRouter"];

export function viewAfterTap(current: ViewId, router: RouterSettings): ViewId | null {
  const rule = router.tapAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export function viewAfterSwipeDown(current: ViewId, router: RouterSettings): ViewId | null {
  const rule = router.swipeDownAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export function inactivityTarget(current: ViewId, router: RouterSettings): ViewId | null {
  const rule = router.inactivityAction;
  return rule.enabled && rule.targetView !== current ? rule.targetView : null;
}
