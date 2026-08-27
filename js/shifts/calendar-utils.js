// --- CALENDAR UTILS: Date formatting, shift hour calculation & role colors ---
function calculateShiftHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // crosses midnight
  }
  return (endMinutes - startMinutes) / 60;
}

function getRoleColor(role) {
  if (!role) return null;
  const roleLower = role.toLowerCase().trim();
  if (roleLower.includes('garson') || roleLower.includes('komi')) return 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
  if (roleLower.includes('mutfak') || roleLower.includes('aşçı')) return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
  if (roleLower.includes('kasiyer')) return 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)';
  if (roleLower.includes('temizlik') || roleLower.includes('bulaşık')) return 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)';
  
  const colors = [
    'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
    'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
  ];
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash += role.charCodeAt(i);
  return colors[hash % colors.length];
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

function formatDateForDB(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
