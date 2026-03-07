/*
 * 19-mission.engine.js
 * Strategic Mission Management Engine – Billionaire Tech Adaptive Life OS
 *
 * Manages long-term, multi-stage objectives (missions):
 *   - Mission creation & lifecycle
 *   - Milestone tracking & completion
 *   - Progress calculation
 *   - Reward triggering on completion
 *   - Integration with rank, badge, score, analytics
 *
 * Missions represent high-level life goals (e.g. "Build a business", "Reach elite health")
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const MISSION_STATUS = {
    active: 'active',
    completed: 'completed',
    archived: 'archived',
    paused: 'paused'
  };

  const DEFAULT_MISSION = {
    missionId: null,
    userId: null,
    title: '',
    description: '',
    category: 'general',          // e.g. finance, health, career, skills
    status: MISSION_STATUS.active,
    createdAt: null,
    updatedAt: null,
    targetDate: null,             // optional end goal date
    completedAt: null,
    progress: 0,                  // 0–100, derived from milestones
    milestones: [],               // array of milestone objects
    reward: null,                 // { type: 'badge', id: '...' } or points
    notes: '',
    tags: []
  };

  const DEFAULT_MILESTONE = {
    milestoneId: null,
    title: '',
    description: '',
    completed: false,
    completedAt: null,
    order: 0                      // for sorting/display
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getMissionsKey(userId) {
    if (!userId) throw new Error('User ID required');
    return `user:${userId}:missions`;
  }

  function generateMissionId() {
    return 'mission_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function generateMilestoneId() {
    return 'ms_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function validateMission(mission) {
    if (!mission || typeof mission !== 'object') {
      throw new Error('Invalid mission object');
    }
    if (!mission.missionId || !mission.userId || !mission.title?.trim()) {
      throw new Error('Mission missing required fields: missionId, userId, title');
    }
    if (mission.status && !Object.values(MISSION_STATUS).includes(mission.status)) {
      throw new Error(`Invalid mission status: ${mission.status}`);
    }
    if (mission.progress !== undefined && (mission.progress < 0 || mission.progress > 100)) {
      throw new Error('Mission progress must be 0–100');
    }
    // Delegate full schema check to validation.engine
    // validation.engine.validate('mission', mission);
    return true;
  }

  function calculateProgress(mission) {
    if (!mission.milestones?.length) return 0;
    const completed = mission.milestones.filter(m => m.completed).length;
    return Math.round((completed / mission.milestones.length) * 100);
  }

  function isMissionCompleted(mission) {
    return mission.status === MISSION_STATUS.completed ||
           (mission.milestones.length > 0 && mission.milestones.every(m => m.completed));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC MISSION ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const MissionEngine = {

    async init() {
      // Load missions when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadMissions(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadMissions(userId);
      });

      // Listen for milestone completion requests from UI
      EventBus.on('MISSION_MILESTONE_COMPLETE_REQUEST', ({ missionId, milestoneId }) => {
        this.completeMilestone(missionId, milestoneId);
      });

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadMissions(userId);
      }

      console.log('[MissionEngine] Initialized – tracking long-term strategic objectives');
    },

    // ─── Load all missions for current user into state ────────────────────────
    async loadMissions(userId) {
      const missionsKey = getMissionsKey(userId);
      let missions = Storage.read(missionsKey) || [];

      missions = missions.map(m => {
        try {
          validateMission(m);
          return {
            ...DEFAULT_MISSION,
            ...m,
            milestones: m.milestones?.map(ms => ({
              ...DEFAULT_MILESTONE,
              ...ms
            })) || []
          };
        } catch (err) {
          console.warn('[MissionEngine] Invalid mission filtered:', m.missionId, err.message);
          return null;
        }
      }).filter(Boolean);

      // Auto-complete missions where all milestones are done
      missions.forEach(m => {
        if (isMissionCompleted(m) && m.status !== MISSION_STATUS.completed) {
          m.status = MISSION_STATUS.completed;
          m.completedAt = Date.now();
        }
      });

      State.update('missions', missions);

      EventBus.emit('MISSIONS_LOADED', {
        userId,
        count: missions.length,
        active: missions.filter(m => m.status === MISSION_STATUS.active).length
      });

      return missions;
    },

    // ─── Get all current missions (from state) ────────────────────────────────
    getMissions() {
      return State.getPath('missions') || [];
    },

    getMissionById(missionId) {
      const missions = this.getMissions();
      return missions.find(m => m.missionId === missionId) || null;
    },

    // ─── Create new mission ───────────────────────────────────────────────────
    async createMission(missionData) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const mission = {
        ...DEFAULT_MISSION,
        ...missionData,
        missionId: generateMissionId(),
        userId: user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        milestones: (missionData.milestones || []).map(ms => ({
          ...DEFAULT_MILESTONE,
          ...ms,
          milestoneId: generateMilestoneId(),
          order: ms.order || 0
        }))
      };

      validateMission(mission);

      const missions = this.getMissions();
      missions.push(mission);

      State.update('missions', missions);
      await this.saveMissions();

      EventBus.emit('MISSION_CREATED', {
        missionId: mission.missionId,
        title: mission.title,
        category: mission.category,
        milestoneCount: mission.milestones.length,
        timestamp: Date.now()
      });

      Recalculation?.trigger('MISSION_CREATED');

      return mission;
    },

    // ─── Update existing mission ──────────────────────────────────────────────
    async updateMission(missionId, updates) {
      const missions = this.getMissions();
      const index = missions.findIndex(m => m.missionId === missionId);

      if (index === -1) throw new Error(`Mission not found: ${missionId}`);

      const updatedMission = {
        ...missions[index],
        ...updates,
        updatedAt: Date.now()
      };

      // Prevent changing missionId or userId
      delete updatedMission.missionId;
      delete updatedMission.userId;

      validateMission(updatedMission);

      missions[index] = updatedMission;
      State.update('missions', missions);
      await this.saveMissions();

      EventBus.emit('MISSION_UPDATED', {
        missionId,
        changes: updates,
        timestamp: Date.now()
      });

      Recalculation?.trigger('MISSION_UPDATED');

      return updatedMission;
    },

    // ─── Add or update milestone ──────────────────────────────────────────────
    async addMilestone(missionId, milestoneData) {
      const mission = this.getMissionById(missionId);
      if (!mission) throw new Error(`Mission not found: ${missionId}`);

      const milestone = {
        ...DEFAULT_MILESTONE,
        ...milestoneData,
        milestoneId: generateMilestoneId(),
        order: milestoneData.order || mission.milestones.length
      };

      const updatedMilestones = [...mission.milestones, milestone];

      await this.updateMission(missionId, { milestones: updatedMilestones });

      EventBus.emit('MISSION_MILESTONE_ADDED', {
        missionId,
        milestoneId: milestone.milestoneId,
        title: milestone.title
      });

      return milestone;
    },

    // ─── Mark milestone as completed ──────────────────────────────────────────
    async completeMilestone(missionId, milestoneId) {
      const mission = this.getMissionById(missionId);
      if (!mission) throw new Error(`Mission not found: ${missionId}`);

      const milestoneIndex = mission.milestones.findIndex(m => m.milestoneId === milestoneId);
      if (milestoneIndex === -1) throw new Error(`Milestone not found: ${milestoneId}`);

      if (mission.milestones[milestoneIndex].completed) {
        console.warn('[MissionEngine] Milestone already completed:', milestoneId);
        return mission;
      }

      const now = Date.now();
      const updatedMilestones = [...mission.milestones];
      updatedMilestones[milestoneIndex] = {
        ...updatedMilestones[milestoneIndex],
        completed: true,
        completedAt: now
      };

      const updatedMission = {
        ...mission,
        milestones: updatedMilestones,
        progress: calculateProgress({ ...mission, milestones: updatedMilestones }),
        updatedAt: now
      };

      // Auto-complete mission if all milestones done
      if (updatedMission.progress === 100) {
        updatedMission.status = MISSION_STATUS.completed;
        updatedMission.completedAt = now;
      }

      await this.updateMission(missionId, updatedMission);

      EventBus.emit('MISSION_MILESTONE_COMPLETED', {
        missionId,
        milestoneId,
        title: updatedMilestones[milestoneIndex].title,
        completedAt: now,
        missionProgress: updatedMission.progress
      });

      if (updatedMission.status === MISSION_STATUS.completed) {
        EventBus.emit('MISSION_COMPLETED', {
          missionId,
          userId: mission.userId,
          completedAt: now,
          title: mission.title
        });
      }

      Recalculation?.trigger('MISSION_MILESTONE_COMPLETED');

      return updatedMission;
    },

    // ─── Delete mission ───────────────────────────────────────────────────────
    async deleteMission(missionId) {
      const missions = this.getMissions();
      const filtered = missions.filter(m => m.missionId !== missionId);

      if (filtered.length === missions.length) {
        throw new Error(`Mission not found for deletion: ${missionId}`);
      }

      State.update('missions', filtered);
      await this.saveMissions();

      EventBus.emit('MISSION_DELETED', {
        missionId,
        timestamp: Date.now()
      });

      Recalculation?.trigger('MISSION_DELETED');

      return true;
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveMissions() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const missions = this.getMissions();
      const missionsKey = getMissionsKey(user.userId);

      Storage.write(missionsKey, missions);
    },

    // ─── Mission statistics ───────────────────────────────────────────────────
    calculateMissionStats() {
      const missions = this.getMissions();
      const active = missions.filter(m => m.status === MISSION_STATUS.active);
      const completed = missions.filter(m => m.status === MISSION_STATUS.completed);

      return {
        totalMissions: missions.length,
        activeMissions: active.length,
        completedMissions: completed.length,
        averageProgress: active.length > 0
          ? active.reduce((sum, m) => sum + m.progress, 0) / active.length
          : 0,
        completionRate: missions.length > 0 ? (completed.length / missions.length) * 100 : 0
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.MissionEngine = MissionEngine;

  // Auto-init after previous engines
  function tryInit() {
    if (window.HabitEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      MissionEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugMissions = {
    create: (data) => MissionEngine.createMission(data),
    completeMilestone: (mid, msid) => MissionEngine.completeMilestone(mid, msid),
    list: () => MissionEngine.getMissions(),
    stats: () => MissionEngine.calculateMissionStats()
  };

})();