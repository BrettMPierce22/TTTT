import { expect, it, vi } from "vitest";
import { createMatchWriter } from "./matchWriter";
const payload = { league_id: "league", created_by: "user", player_a_id: "a", player_b_id: "b", format: 1, games: [{ a: 11, b: 9 }] };
function fixture() {
  let row = null;
  const insert = vi.fn(async (value) => { row = value; return { error: null }; });
  const read = vi.fn(async () => ({ data: row, error: null }));
  const query = { insert, select: () => query, eq: () => query, maybeSingle: read };
  let counter = 0;
  return { insert, read, setRow: (value) => { row = value; }, writer: createMatchWriter({ from: () => query }, () => `id-${++counter}`) };
}
it("reconciles a committed save whose response was lost without inserting twice", async () => {
  const f = fixture();
  f.insert.mockImplementationOnce(async (value) => { f.setRow(value); throw new Error("Lost response"); });
  await expect(f.writer.save(payload)).rejects.toThrow("Lost response");
  expect(await f.writer.save(payload)).toBe("id-1");
  expect(f.insert).toHaveBeenCalledTimes(1);
});
it("reuses the same ID if an uncertain save did not commit", async () => {
  const f = fixture();
  f.insert.mockRejectedValueOnce(new Error("Offline"));
  await expect(f.writer.save(payload)).rejects.toThrow();
  expect(await f.writer.save(payload)).toBe("id-1");
  expect(f.insert.mock.calls.map(([value]) => value.id)).toEqual(["id-1", "id-1"]);
});
it("allows a separate identical game after a confirmed success", async () => {
  const f = fixture();
  expect(await f.writer.save(payload)).toBe("id-1");
  expect(await f.writer.save(payload)).toBe("id-2");
});
it("blocks changing an unconfirmed draft and concurrent saves", async () => {
  const f = fixture();
  let reject;
  f.insert.mockImplementationOnce(() => new Promise((resolve, no) => { reject = no; }));
  const first = f.writer.save(payload);
  await expect(f.writer.save(payload)).rejects.toThrow(/already/);
  reject(new Error("Offline"));
  await expect(first).rejects.toThrow();
  await expect(f.writer.save({ ...payload, format: 3 })).rejects.toThrow(/unconfirmed/);
});
it("allows correction after a definite database rejection", async () => {
  const f = fixture();
  f.insert.mockResolvedValueOnce({ error: { code: "23514", message: "Invalid scores" } });
  await expect(f.writer.save(payload)).rejects.toBeTruthy();
  expect(await f.writer.save({ ...payload, player_b_id: "c" })).toBe("id-2");
});
it("accepts equivalent JSONB game objects with different property order", async () => {
  const f = fixture();
  f.insert.mockImplementationOnce(async (value) => { f.setRow({ ...value, games: [{ b: 9, a: 11 }] }); throw new Error("Lost response"); });
  await expect(f.writer.save(payload)).rejects.toThrow();
  expect(await f.writer.save(payload)).toBe("id-1");
});
it("does not insert again when an unconfirmed match cannot be read", async () => {
  const f = fixture();
  f.insert.mockRejectedValueOnce(new Error("Lost response"));
  await expect(f.writer.save(payload)).rejects.toThrow();
  f.read.mockResolvedValue({ error: new Error("Offline") });
  await expect(f.writer.save(payload)).rejects.toThrow("Offline");
  expect(f.insert).toHaveBeenCalledTimes(1);
});
