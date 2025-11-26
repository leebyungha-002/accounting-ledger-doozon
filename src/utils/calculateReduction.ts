/**
 * 최초값 대비 현재 적용된 spacing이 몇 %인지 계산하는 유틸리티
 */

export const calculateReduction = () => {
  console.log('=== Spacing 감소율 계산 ===\n');

  // 최초값 (수정 전)
  const original = {
    header: { py: 16, px: 16 }, // py-4, px-4
    main: { py: 32, px: 16 },   // py-8, px-4
    spaceY: 24,                  // space-y-6
    gap: 16,                     // gap-4
  };

  // 현재값 (수정 후)
  const current = {
    header: { py: 4, px: 8 },    // py-1, px-2
    main: { py: 8, px: 8 },      // py-2, px-2
    spaceY: 8,                   // space-y-2
    gap: 8,                      // gap-2
  };

  console.log('📊 최초값 대비 현재값 비율:\n');

  // Header
  const headerPyRatio = (current.header.py / original.header.py * 100).toFixed(1);
  const headerPxRatio = (current.header.px / original.header.px * 100).toFixed(1);
  const headerAvgRatio = ((current.header.py + current.header.px) / (original.header.py + original.header.px) * 100).toFixed(1);
  console.log(`Header:`);
  console.log(`  - 상하 padding: ${original.header.py}px → ${current.header.py}px = ${headerPyRatio}% (${100 - parseFloat(headerPyRatio)}% 감소)`);
  console.log(`  - 좌우 padding: ${original.header.px}px → ${current.header.px}px = ${headerPxRatio}% (${100 - parseFloat(headerPxRatio)}% 감소)`);
  console.log(`  - 평균: ${headerAvgRatio}% (${100 - parseFloat(headerAvgRatio)}% 감소)\n`);

  // Main
  const mainPyRatio = (current.main.py / original.main.py * 100).toFixed(1);
  const mainPxRatio = (current.main.px / original.main.px * 100).toFixed(1);
  const mainAvgRatio = ((current.main.py + current.main.px) / (original.main.py + original.main.px) * 100).toFixed(1);
  console.log(`Main:`);
  console.log(`  - 상하 padding: ${original.main.py}px → ${current.main.py}px = ${mainPyRatio}% (${100 - parseFloat(mainPyRatio)}% 감소)`);
  console.log(`  - 좌우 padding: ${original.main.px}px → ${current.main.px}px = ${mainPxRatio}% (${100 - parseFloat(mainPxRatio)}% 감소)`);
  console.log(`  - 평균: ${mainAvgRatio}% (${100 - parseFloat(mainAvgRatio)}% 감소)\n`);

  // Space-y
  const spaceYRatio = (current.spaceY / original.spaceY * 100).toFixed(1);
  console.log(`Space-y: ${original.spaceY}px → ${current.spaceY}px = ${spaceYRatio}% (${100 - parseFloat(spaceYRatio)}% 감소)\n`);

  // Gap
  const gapRatio = (current.gap / original.gap * 100).toFixed(1);
  console.log(`Gap: ${original.gap}px → ${current.gap}px = ${gapRatio}% (${100 - parseFloat(gapRatio)}% 감소)\n`);

  // 전체 평균
  const totalOriginal = original.header.py + original.header.px + original.main.py + original.main.px + original.spaceY + original.gap;
  const totalCurrent = current.header.py + current.header.px + current.main.py + current.main.px + current.spaceY + current.gap;
  const totalRatio = (totalCurrent / totalOriginal * 100).toFixed(1);
  
  console.log('='.repeat(50));
  console.log(`📌 전체 평균: 최초값의 ${totalRatio}% (${100 - parseFloat(totalRatio)}% 감소)`);
  console.log('='.repeat(50));
  console.log(`\n즉, 현재 적용된 spacing은 최초값의 약 ${totalRatio}% 수준입니다.`);

  return {
    headerPyRatio: parseFloat(headerPyRatio),
    headerPxRatio: parseFloat(headerPxRatio),
    headerAvgRatio: parseFloat(headerAvgRatio),
    mainPyRatio: parseFloat(mainPyRatio),
    mainPxRatio: parseFloat(mainPxRatio),
    mainAvgRatio: parseFloat(mainAvgRatio),
    spaceYRatio: parseFloat(spaceYRatio),
    gapRatio: parseFloat(gapRatio),
    totalRatio: parseFloat(totalRatio),
  };
};

// 전역 함수로 등록
if (typeof window !== 'undefined') {
  (window as any).calculateReduction = calculateReduction;
}






