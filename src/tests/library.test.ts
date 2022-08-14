import test from "ava";
import auth from "..";
test("user creation", (t) => {
  const authentication = auth();

  t.pass();
});

test("bar", async (t) => {
  const bar = Promise.resolve("bar");
  t.is(await bar, "bar");
});
