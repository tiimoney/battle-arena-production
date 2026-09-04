import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import { EMPTY_LEAGUE_STATE, type LeagueState, type StoredGroup } from "./logic/leagueSnapshot";
import { notFound } from "./errors";

const LEAGUE_STATE_REF = doc(db, "league_state", "active");

export async function readLeagueState(): Promise<LeagueState> {
  const snap = await getDoc(LEAGUE_STATE_REF);
  if (!snap.exists()) {
    return EMPTY_LEAGUE_STATE;
  }
  const data = snap.data() ?? {};
  return {
    archivedSeasons: data.archivedSeasons ?? [],
  };
}

// The old app read this whole document into memory, mutated its local copy, and
// wrote the whole thing back -- with no real concurrency guard (two admin sessions
// could race and clobber each other). Running that same read-mutate-write cycle
// inside a Firestore transaction is a genuine correctness improvement: Firestore
// retries one side automatically on a conflicting concurrent write.
export async function withLeagueState<T>(fn: (state: LeagueState) => T | Promise<T>): Promise<T> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(LEAGUE_STATE_REF);
    const data = snap.exists() ? snap.data() ?? {} : {};
    const state: LeagueState = {
      archivedSeasons: data.archivedSeasons ?? [],
    };

    const result = await fn(state);
    tx.set(LEAGUE_STATE_REF, state);
    return result;
  });
}

// Same read-transact-write pattern as above, scoped to a single `groups/{groupId}`
// document instead of the one shared `league_state/active` doc -- each group's
// fixtures now live and get mutated independently, so different groups' writes
// (e.g. two admins generating fixtures for two different episodes) no longer
// contend with each other the way a single shared document would.
export async function readGroupState(groupId: string): Promise<StoredGroup> {
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) throw notFound("Group could not be found.");
  return snap.data() as StoredGroup;
}

export async function withGroupState<T>(groupId: string, fn: (group: StoredGroup) => T | Promise<T>): Promise<T> {
  const ref = doc(db, "groups", groupId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw notFound("Group could not be found.");
    const group = snap.data() as StoredGroup;

    const result = await fn(group);
    tx.set(ref, group);
    return result;
  });
}
