/**
 * Fetch student profile data from the database for LLM context injection.
 */

/**
 * @param {object} pool - pg Pool instance
 * @param {string} studentId
 * @param {string} courseId
 * @returns {{studentType: string, weakPoints: string[], strongPoints: string[]}}
 */
async function fetchStudentProfile(pool, studentId, courseId) {
  try {
    const [masteryResult, profileResult] = await Promise.all([
      pool.query(
        `SELECT chapter, point_no, mastery_level
         FROM knowledge_mastery
         WHERE student_id = $1 AND course_id = $2
         ORDER BY chapter, point_no`,
        [studentId, courseId],
      ),
      pool.query(
        `SELECT label, current_score, class_average
         FROM student_profile_scores
         WHERE student_id = $1 AND course_id = $2
         ORDER BY sort_order`,
        [studentId, courseId],
      ),
    ])

    const masteryRows = masteryResult.rows
    const profileRows = profileResult.rows

    // Determine student type from average mastery level
    const avgMastery = masteryRows.length > 0
      ? masteryRows.reduce((sum, r) => sum + Number(r.mastery_level), 0) / masteryRows.length
      : 2

    let studentType = '标准型'
    if (avgMastery <= 1.5) studentType = '基础型'
    else if (avgMastery >= 3.5) studentType = '进阶型'

    // Find weak points (mastery 0-1) and strong points (mastery 3-4)
    const weakPoints = []
    const strongPoints = []

    // Group by chapter for readable labels
    const chapterMap = new Map()
    for (const row of masteryRows) {
      if (!chapterMap.has(row.chapter)) {
        chapterMap.set(row.chapter, [])
      }
      chapterMap.get(row.chapter).push({
        pointNo: Number(row.point_no),
        level: Number(row.mastery_level),
      })
    }

    for (const [chapter, points] of chapterMap) {
      const weakCount = points.filter((p) => p.level <= 1).length
      const strongCount = points.filter((p) => p.level >= 3).length
      const total = points.length

      if (weakCount >= total * 0.5) {
        weakPoints.push(chapter)
      }
      if (strongCount >= total * 0.5) {
        strongPoints.push(chapter)
      }
    }

    // Also extract profile dimension info
    const profileLabels = profileRows.map((r) => ({
      label: r.label,
      score: Number(r.current_score),
      avg: Number(r.class_average),
    }))

    return {
      studentType,
      weakPoints,
      strongPoints,
      profileLabels,
      avgMastery: Math.round(avgMastery * 10) / 10,
    }
  } catch (error) {
    console.error('Failed to fetch student profile, using defaults:', error.message)
    return {
      studentType: '标准型',
      weakPoints: [],
      strongPoints: [],
      profileLabels: [],
      avgMastery: 2,
    }
  }
}

module.exports = { fetchStudentProfile }
