const mongoose = require('mongoose');
const Event = require('../models/Event');
const Profile = require('../models/Profile');
const User = require('../models/User');
const Follow = require('../models/Follow');
const SavedEvent = require('../models/SavedEvent');
const Registration = require('../models/Registration');
const { attachSessionsAndPacks } = require('./eventController');
const { haversineKm } = require('../utils/geo');

const NEAR_RADIUS_KM = 200;
const NEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const POPULAR_CAPACITY_RATIO = 0.5;
const POPULAR_DISTINCT_USERS = 5;
const SECTION_LIMIT = 10;
const TOP_STYLE_COUNT = 3;
const CANDIDATE_POOL_SIZE = 300;

const distanceKm = (viewerLocation, event) =>
  viewerLocation && event.location ? haversineKm(viewerLocation, event.location) : null;

const maxCapacityRatio = (event) => {
  const ratios = (event.sessions || [])
    .filter((s) => !s.isUnlimitedCapacity && s.capacity)
    .map((s) => s.confirmedCount / s.capacity);
  return ratios.length ? Math.max(...ratios) : 0;
};

const getExploreSections = async (req, res) => {
  const viewerId = req.userId;

  const [viewerProfile, savedEvents, myRegistrations, baseEvents] = await Promise.all([
    Profile.findOne({ userId: viewerId }),
    SavedEvent.find({ userId: viewerId }),
    Registration.find({ userId: viewerId, status: 'confirmed' }),
    Event.find({ visibility: 'public', status: 'published', ownerUserId: { $ne: viewerId } })
      .sort({ createdAt: -1 })
      .limit(CANDIDATE_POOL_SIZE),
  ]);

  const eventIds = baseEvents.map((e) => e._id);
  const [enrichedEvents, confirmedRegs] = await Promise.all([
    attachSessionsAndPacks(baseEvents, viewerId),
    Registration.find({ eventId: { $in: eventIds }, status: 'confirmed' }),
  ]);

  const distinctUsersByEvent = {};
  for (const reg of confirmedRegs) {
    const key = reg.eventId.toString();
    (distinctUsersByEvent[key] ??= new Set()).add(reg.userId.toString());
  }

  const affinityEventIds = [
    ...new Set([
      ...savedEvents.map((s) => s.eventId.toString()),
      ...myRegistrations.map((r) => r.eventId.toString()),
    ]),
  ];
  const affinityEvents = affinityEventIds.length
    ? await Event.find({ _id: { $in: affinityEventIds } })
    : [];
  const styleCounts = {};
  for (const event of affinityEvents) {
    for (const style of event.style) styleCounts[style] = (styleCounts[style] || 0) + 1;
  }
  const topStyles = Object.entries(styleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_STYLE_COUNT)
    .map(([style]) => style);

  const viewerLocation = viewerProfile?.location || null;

  const nearYou = enrichedEvents
    .map((event) => ({ event, distance: distanceKm(viewerLocation, event) }))
    .filter((x) => x.distance !== null && x.distance <= NEAR_RADIUS_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SECTION_LIMIT)
    .map((x) => x.event);

  const now = Date.now();
  const newest = enrichedEvents
    .filter((event) => now - new Date(event.publishedAt || event.createdAt).getTime() <= NEW_WINDOW_MS)
    .sort(
      (a, b) =>
        new Date(b.publishedAt || b.createdAt).getTime() -
        new Date(a.publishedAt || a.createdAt).getTime()
    )
    .slice(0, SECTION_LIMIT);

  const popular = enrichedEvents
    .map((event) => ({
      event,
      ratio: maxCapacityRatio(event),
      distinct: distinctUsersByEvent[event.id]?.size || 0,
    }))
    .filter((x) => x.ratio >= POPULAR_CAPACITY_RATIO || x.distinct >= POPULAR_DISTINCT_USERS)
    .sort((a, b) => b.ratio - a.ratio || b.distinct - a.distinct)
    .slice(0, SECTION_LIMIT)
    .map((x) => x.event);

  const forYou = enrichedEvents
    .map((event) => {
      const nearMatch = distanceKm(viewerLocation, event) !== null &&
        distanceKm(viewerLocation, event) <= NEAR_RADIUS_KM;
      const styleMatch = topStyles.length > 0 && event.style.some((s) => topStyles.includes(s));
      return { event, score: (nearMatch ? 1 : 0) + (styleMatch ? 1 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SECTION_LIMIT)
    .map((x) => x.event);

  const popularProfiles = await getPopularProfiles(viewerId);

  return res.json({ nearYou, newest, popular, forYou, popularProfiles });
};

const getPopularProfiles = async (viewerId) => {
  const followCounts = await Follow.aggregate([
    { $match: { followingId: { $ne: new mongoose.Types.ObjectId(viewerId) } } },
    { $group: { _id: '$followingId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: SECTION_LIMIT },
  ]);
  if (followCounts.length === 0) return [];

  const popularUserIds = followCounts.map((f) => f._id);
  const [users, profiles, viewerFollowing] = await Promise.all([
    User.find({ _id: { $in: popularUserIds } }),
    Profile.find({ userId: { $in: popularUserIds } }),
    Follow.find({ followerId: viewerId, followingId: { $in: popularUserIds } }),
  ]);

  const usernameByUser = {};
  for (const u of users) usernameByUser[u.id] = u.username;
  const profileByUser = {};
  for (const p of profiles) profileByUser[p.userId.toString()] = p.toJSON();
  const followingSet = new Set(viewerFollowing.map((f) => f.followingId.toString()));
  const countByUser = {};
  for (const f of followCounts) countByUser[f._id.toString()] = f.count;

  return popularUserIds
    .map((id) => id.toString())
    .filter((id) => profileByUser[id])
    .map((id) => ({
      userId: id,
      username: usernameByUser[id] || '',
      displayName: profileByUser[id].displayName,
      profileImage: profileByUser[id].profileImage,
      city: profileByUser[id].city,
      country: profileByUser[id].country,
      followersCount: countByUser[id] || 0,
      isFollowing: followingSet.has(id),
    }));
};

module.exports = { getExploreSections };
