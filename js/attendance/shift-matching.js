// --- SHIFT MATCHING: Worker-shift assignment matching ---
async function findAssignedShiftForWorker(restaurantId, workerId, dateStr) {
  try {
    const workerDocRef = window.firebaseFirestore.doc(window.db, 'users', workerId);
    const workerSnap = await window.firebaseFirestore.getDoc(workerDocRef);
    let workerPhone = '';
    let workerName = '';
    if (workerSnap.exists()) {
      const wData = workerSnap.data();
      workerPhone = wData.employeePhone || wData.phone || '';
      workerName = wData.employeeName || wData.authorizedName || '';
    }

    const staffRef = window.firebaseFirestore.collection(window.db, 'restaurantStaff');
    const staffCandidates = [];

    const staffQ = window.firebaseFirestore.query(
      staffRef,
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('vardiyanUserId', '==', workerId)
    );
    const staffSnapshot = await window.firebaseFirestore.getDocs(staffQ);
    staffSnapshot.forEach(doc => staffCandidates.push({ id: doc.id, ...doc.data() }));

    if (workerPhone) {
      const phoneQ = window.firebaseFirestore.query(
        staffRef,
        window.firebaseFirestore.where('restaurantId', '==', restaurantId)
      );
      const phoneSnapshot = await window.firebaseFirestore.getDocs(phoneQ);
      phoneSnapshot.forEach(doc => {
        const data = doc.data();
        const normalizedStaffPhone = typeof window.normalizePhone === 'function'
          ? window.normalizePhone(data.phone)
          : '';
        const normalizedWorkerPhone = typeof window.normalizePhone === 'function'
          ? window.normalizePhone(workerPhone)
          : '';
        if (normalizedStaffPhone && normalizedWorkerPhone && normalizedStaffPhone === normalizedWorkerPhone) {
          if (!staffCandidates.some(candidate => candidate.id === doc.id)) {
            staffCandidates.push({ id: doc.id, ...data });
          }
        }
      });
    }

    const preferredStaffIds = new Set(staffCandidates.map(candidate => candidate.id));

    const shiftQ = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('date', '==', dateStr)
    );
    const shiftSnapshot = await window.firebaseFirestore.getDocs(shiftQ);

    if (shiftSnapshot.empty) {
      return null;
    }

    const shiftsForDay = shiftSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const directMatch = shiftsForDay.find(shift => 
      preferredStaffIds.has(shift.staffId) && 
      (!shift.workerId || shift.workerId === workerId)
    );
    if (directMatch) {
      console.info('[QR Shift Match]', 'direct', { dateStr, workerId, shiftId: directMatch.id, staffId: directMatch.staffId, startTime: directMatch.startTime, endTime: directMatch.endTime });
      return formatShiftMatch(directMatch);
    }

    const workerMatch = shiftsForDay.find(shift => shift.workerId === workerId);
    if (workerMatch) {
      console.info('[QR Shift Match]', 'workerId', { dateStr, workerId, shiftId: workerMatch.id, staffId: workerMatch.staffId, startTime: workerMatch.startTime, endTime: workerMatch.endTime });
      return formatShiftMatch(workerMatch);
    }

    const nameMatch = shiftsForDay.find(shift => 
      shift.workerName === workerName && 
      shift.workerName !== 'Çalışan' && // avoid matching defaults
      (!shift.workerId || shift.workerId === workerId)
    );
    if (nameMatch) {
      console.info('[QR Shift Match]', 'workerName', { dateStr, workerId, shiftId: nameMatch.id, staffId: nameMatch.staffId, startTime: nameMatch.startTime, endTime: nameMatch.endTime });
      return formatShiftMatch(nameMatch);
    }

    const unassignedMatch = shiftsForDay.find(shift => !shift.workerId && !shift.workerName && !shift.checkInTime && !shift.checkOutTime);
    if (unassignedMatch) {
      console.info('[QR Shift Match]', 'unassigned', { dateStr, workerId, shiftId: unassignedMatch.id, staffId: unassignedMatch.staffId, startTime: unassignedMatch.startTime, endTime: unassignedMatch.endTime });
      return formatShiftMatch(unassignedMatch);
    }

    const singleShift = shiftsForDay.length === 1 ? shiftsForDay[0] : null;
    if (singleShift && (!singleShift.workerId || singleShift.workerId === workerId)) {
      // Also ensure we don't steal a shift explicitly assigned to another staff member
      const isAssignedToOtherStaff = singleShift.staffId && !preferredStaffIds.has(singleShift.staffId);
      if (!isAssignedToOtherStaff) {
        console.info('[QR Shift Match]', 'single', { dateStr, workerId, shiftId: singleShift.id, staffId: singleShift.staffId, startTime: singleShift.startTime, endTime: singleShift.endTime });
        return formatShiftMatch(singleShift);
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding assigned shift for worker:", error);
    return null;
  }
}

function formatShiftMatch(shiftData) {
  return {
    shiftDocId: shiftData.id,
    shiftId: shiftData.id,
    startTime: shiftData.startTime || null,
    endTime: shiftData.endTime || null,
    role: shiftData.role || null,
    notes: shiftData.notes || null
  };
}
