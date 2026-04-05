/// <reference types="nakama-runtime" />

const COLLECTION = "tic_tac_toe_profile";
const KEY = "flags";

export type ProfileFlagsValue = {
  usernameOnboarded?: boolean;
};

export function readUsernameOnboarded(
  nk: nkruntime.Nakama,
  userId: string
): boolean {
  const objs = nk.storageRead([
    { collection: COLLECTION, key: KEY, userId },
  ]);
  if (!objs || objs.length === 0) {
    return false;
  }
  const v = objs[0].value as ProfileFlagsValue;
  return v.usernameOnboarded === true;
}

export function writeUsernameOnboarded(
  nk: nkruntime.Nakama,
  userId: string
): void {
  nk.storageWrite([
    {
      collection: COLLECTION,
      key: KEY,
      userId,
      value: { usernameOnboarded: true },
      permissionRead: 0,
      permissionWrite: 0,
    },
  ]);
}
