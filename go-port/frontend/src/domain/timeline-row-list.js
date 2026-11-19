export class TimelineRowList {
  static sameSenderAsAbove(rows, index) {
    const previous = rows[index - 1];
    return !!previous && previous.sender === rows[index].sender;
  }
}
