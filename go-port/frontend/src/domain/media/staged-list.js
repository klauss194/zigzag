export class StagedList {
  static MAX = 10;

  static add(list, entry) {
    return list.length >= StagedList.MAX ? null : [...list, entry];
  }

  static remove(list, entry) {
    return list.filter((item) => item !== entry);
  }
}
