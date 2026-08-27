import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_NAV_GROUPS,
  mobileBarItems,
  moreSheetGroups,
  visibleGroups,
  visibleItems,
} from "../src/lib/admin-nav";

test("every nav item has a non-empty name and href", () => {
  // An earlier version listed routeless links — three links straight to a 404.
  for (const group of ADMIN_NAV_GROUPS) {
    assert.ok(group.label.length > 0);
    assert.ok(group.items.length > 0, `${group.label} is empty`);
    for (const item of group.items) {
      assert.ok(item.name.length > 0);
      assert.ok(item.href.startsWith("/admin"), item.href);
    }
  }
});

test("hrefs are unique across all groups", () => {
  const hrefs = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("a non-owner never sees an owner-only item", () => {
  const items = visibleItems(false);
  assert.equal(items.some((i) => i.ownerOnly), false);
});

test("an owner sees every item", () => {
  const all = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  assert.equal(visibleItems(true).length, all.length);
});

test("a group that becomes empty for a non-owner is dropped entirely", () => {
  // A group label with nothing under it reads as a broken section.
  for (const group of visibleGroups(false)) {
    assert.ok(group.items.length > 0, group.label);
  }
});

test("the mobile bar is always four slots", () => {
  // Three routes plus More. A bottom bar cannot hold grouped navigation.
  assert.equal(mobileBarItems(true).length, 3);
  assert.equal(mobileBarItems(false).length, 3);
});

test("no route is orphaned on mobile", () => {
  for (const isOwner of [true, false]) {
    const reachable = new Set([
      ...mobileBarItems(isOwner).map((i) => i.href),
      ...moreSheetGroups(isOwner).flatMap((g) => g.items.map((i) => i.href)),
    ]);
    for (const item of visibleItems(isOwner)) {
      assert.ok(reachable.has(item.href), `${item.href} unreachable on mobile`);
    }
  }
});

test("the More sheet never repeats what is already on the bar", () => {
  const bar = new Set(mobileBarItems(true).map((i) => i.href));
  for (const group of moreSheetGroups(true)) {
    for (const item of group.items) {
      assert.equal(bar.has(item.href), false, item.href);
    }
  }
});

test("the More sheet hides owner-only items from a non-owner", () => {
  const hrefs = moreSheetGroups(false).flatMap((g) => g.items.map((i) => i.href));
  assert.equal(hrefs.includes("/admin/team"), false);
});
