const CalendarNote = require('../models/CalendarNote');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Query-param hour anchors a note to a specific hour in the week scheduler;
// omitting it keeps the existing whole-day note behavior.
const parseHour = (raw) => {
  if (raw === undefined) return { hour: null };
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: 'Hora inválida' };
  }
  return { hour };
};

const getMyCalendarNotes = async (req, res) => {
  const notes = await CalendarNote.find({ userId: req.userId }).sort({ date: 1, hour: 1 });
  return res.json({ notes: notes.map((n) => n.toJSON()) });
};

const setCalendarNote = async (req, res) => {
  const { date } = req.params;

  if (!DATE_REGEX.test(date)) {
    return res.status(400).json({ message: 'Fecha inválida' });
  }
  const { hour, error } = parseHour(req.query.hour);
  if (error) return res.status(400).json({ message: error });

  // A whole-day note (no hour) is freeform text; an hour-anchored note is a
  // lightweight personal event instead, with a title, optional address, and
  // the hour it ends at.
  if (hour === null) {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'La nota no puede estar vacía' });
    }
    const note = await CalendarNote.findOneAndUpdate(
      { userId: req.userId, date, hour },
      { text: text.trim(), title: null, address: null, endHour: null },
      { new: true, upsert: true, runValidators: true }
    );
    return res.status(200).json({ note: note.toJSON() });
  }

  const { title, address } = req.body;
  const endHour = Number(req.body.endHour);
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'Añade un título' });
  }
  if (!Number.isInteger(endHour) || endHour <= hour || endHour > 24) {
    return res.status(400).json({ message: 'Hora de fin inválida' });
  }
  const note = await CalendarNote.findOneAndUpdate(
    { userId: req.userId, date, hour },
    {
      title: title.trim(),
      address: typeof address === 'string' && address.trim() ? address.trim() : null,
      endHour,
      text: '',
    },
    { new: true, upsert: true, runValidators: true }
  );
  return res.status(200).json({ note: note.toJSON() });
};

const deleteCalendarNote = async (req, res) => {
  const { date } = req.params;
  if (!DATE_REGEX.test(date)) {
    return res.status(400).json({ message: 'Fecha inválida' });
  }
  const { hour, error } = parseHour(req.query.hour);
  if (error) return res.status(400).json({ message: error });

  await CalendarNote.deleteOne({ userId: req.userId, date, hour });
  return res.status(204).send();
};

module.exports = { getMyCalendarNotes, setCalendarNote, deleteCalendarNote };
