// Checks the device limit against the real database.
//   npx tsx scripts/verify-device-limit.mts <paidUserId> <freemiumUserId>
// Revokes every device of both users at the end, which signs them out
// everywhere. Use test accounts only.
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { listActiveDevices, registerDevice, revokeOtherDevices } from "../src/lib/devices";

const [paidUserId, freeUserId] = process.argv.slice(2);
if (!paidUserId || !freeUserId) {
  console.error("usage: verify-device-limit.mts <paidUserId> <freemiumUserId>");
  process.exit(1);
}

async function main() {
  await revokeOtherDevices(paidUserId, undefined);
  await revokeOtherDevices(freeUserId, undefined);

  const first = await registerDevice({ userId: paidUserId, label: "verify 1", limited: true });
  const second = await registerDevice({ userId: paidUserId, label: "verify 2", limited: true });
  const third = await registerDevice({ userId: paidUserId, label: "verify 3", limited: true });
  const paid = (await listActiveDevices(paidUserId)).map((d) => d.id).sort();
  assert.deepEqual(paid, [second, third].sort(), "paid: the first device is signed out");

  // Simultaneous sign-ins must not both slip past the limit.
  await Promise.all([
    registerDevice({ userId: paidUserId, label: "race a", limited: true }),
    registerDevice({ userId: paidUserId, label: "race b", limited: true }),
    registerDevice({ userId: paidUserId, label: "race c", limited: true }),
  ]);
  assert.equal((await listActiveDevices(paidUserId)).length, 2, "paid: concurrent sign-ins respect the limit");

  for (let i = 0; i < 3; i++) {
    await registerDevice({ userId: freeUserId, label: `free ${i}`, limited: false });
  }
  assert.equal((await listActiveDevices(freeUserId)).length, 3, "freemium: not limited");

  await revokeOtherDevices(paidUserId, undefined);
  await revokeOtherDevices(freeUserId, undefined);
  console.log("device limit verified; first device", first, "was revoked");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
