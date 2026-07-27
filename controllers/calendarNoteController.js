const CalendarNote = require('../models/CalendarNote');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getMyCalendarNotes = async (req, res) => {
  const notes = await CalendarNote.find({ userId: req.userId }).sort({ date: 1 });
  return res.json({ notes: notes.map((n) => n.toJSON()) });
};

const setCalendarNote = async (req, res) => {
  const { date } = req.params;
  const { text } = req.body;

  if (!DATE_REGEX.test(date)) {
    return res.status(400).json({ message: 'Fecha inválida' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'La nota no puede estar vacía' });
  }

  const note = await CalendarNote.findOneAndUpdate(
    { userId: req.userId, date },
    { text: text.trim() },
    { new: true, upsert: true, runValidators: true }
  );
  return res.status(200).json({ note: note.toJSON() });
};

const deleteCalendarNote = async (req, res) => {
  const { date } = req.params;
  if (!DATE_REGEX.test(date)) {
    return res.status(400).json({ message: 'Fecha inválida' });
  }
  await CalendarNote.deleteOne({ userId: req.userId, date });
  return res.status(204).send();
};

module.exports = { getMyCalendarNotes, setCalendarNote, deleteCalendarNote };
