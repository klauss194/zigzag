import { rooms, router, roomWrite, errors } from '../app/container.js';

let creating = null;

export class NotesActions {
  static open() {
    const known = rooms.notesRoomId;
    if (known) { router.openRoom(known); return Promise.resolve(); }
    creating ??= rooms.whenListed()
      .then(() => roomWrite.ensureNotesRoom(rooms.notesRoomId))
      .then((roomId) => { if (roomId) router.openRoom(roomId); })
      .catch((error) => errors.report('createNotes', { error }))
      .finally(() => { creating = null; });
    return creating;
  }
}
