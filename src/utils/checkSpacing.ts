/**
 * 화면 spacing이 제대로 적용되었는지 확인하는 유틸리티
 * 브라우저 콘솔에서 실행: window.checkSpacing()
 */

export const checkSpacing = () => {
  console.log('=== 화면 Spacing 확인 ===\n');

  // 1. 주요 페이지 컴포넌트 확인
  const mainElements = document.querySelectorAll('[class*="space-y"], [class*="py-"], [class*="px-"], [class*="gap-"]');
  console.log(`1. Spacing 관련 클래스를 가진 요소: ${mainElements.length}개\n`);

  // 2. AIAnalysis 페이지 확인
  const aiAnalysisPage = document.querySelector('div.min-h-screen.bg-background');
  if (aiAnalysisPage) {
    const styles = window.getComputedStyle(aiAnalysisPage);
    console.log('2. AIAnalysis 페이지 메인 컨테이너:');
    console.log(`   - padding-top: ${styles.paddingTop}`);
    console.log(`   - padding-bottom: ${styles.paddingBottom}`);
    console.log(`   - padding-left: ${styles.paddingLeft}`);
    console.log(`   - padding-right: ${styles.paddingRight}\n`);
  }

  // 3. Header 확인
  const header = document.querySelector('header');
  if (header) {
    const headerContainer = header.querySelector('.container');
    if (headerContainer) {
      const styles = window.getComputedStyle(headerContainer);
      console.log('3. Header 컨테이너:');
      console.log(`   - padding-top: ${styles.paddingTop}`);
      console.log(`   - padding-bottom: ${styles.paddingBottom}`);
      console.log(`   - padding-left: ${styles.paddingLeft}`);
      console.log(`   - padding-right: ${styles.paddingRight}\n`);
    }
  }

  // 4. Main 컨테이너 확인
  const main = document.querySelector('main.container');
  if (main) {
    const styles = window.getComputedStyle(main);
    console.log('4. Main 컨테이너:');
    console.log(`   - padding-top: ${styles.paddingTop}`);
    console.log(`   - padding-bottom: ${styles.paddingBottom}`);
    console.log(`   - padding-left: ${styles.paddingLeft}`);
    console.log(`   - padding-right: ${styles.paddingRight}\n`);
  }

  // 5. space-y 클래스 확인 (예상: space-y-4, space-y-3이어야 함)
  const spaceYElements = Array.from(document.querySelectorAll('[class*="space-y"]'))
    .map(el => {
      const classes = Array.from(el.className.split(' ')).filter(c => c.includes('space-y'));
      return { element: el.tagName.toLowerCase(), classes };
    })
    .filter(item => item.classes.length > 0);
  
  console.log('5. space-y 클래스 사용 현황:');
  spaceYElements.slice(0, 10).forEach(item => {
    console.log(`   - ${item.element}: ${item.classes.join(', ')}`);
  });
  if (spaceYElements.length > 10) {
    console.log(`   ... 외 ${spaceYElements.length - 10}개 더`);
  }
  console.log('');

  // 6. gap 클래스 확인
  const gapElements = Array.from(document.querySelectorAll('[class*="gap-"]'))
    .map(el => {
      const classes = Array.from(el.className.split(' ')).filter(c => c.includes('gap-'));
      return { element: el.tagName.toLowerCase(), classes };
    })
    .filter(item => item.classes.length > 0);
  
  console.log('6. gap 클래스 사용 현황:');
  gapElements.slice(0, 10).forEach(item => {
    console.log(`   - ${item.element}: ${item.classes.join(', ')}`);
  });
  if (gapElements.length > 10) {
    console.log(`   ... 외 ${gapElements.length - 10}개 더`);
  }
  console.log('');

  // 7. 수정 전후 비교 (수정 후 예상 값)
  console.log('7. 수정 전후 비교:');
  console.log('   수정 전 예상:');
  console.log('   - Header: py-4 (16px), px-4 (16px)');
  console.log('   - Main: py-8 (32px), px-4 (16px)');
  console.log('   - space-y-6 (24px), space-y-8 (32px)');
  console.log('   - gap-6 (24px), gap-4 (16px)');
  console.log('');
  console.log('   수정 후 예상:');
  console.log('   - Header: py-1 (4px), px-2 (8px)');
  console.log('   - Main: py-2 (8px), px-2 (8px)');
  console.log('   - space-y-2 (8px)');
  console.log('   - gap-2 (8px)');
  console.log('');

  // 8. 실제 적용된 스타일 확인 (CSS 파일 로드는 Vite에서 번들링되어 직접 확인 어려움)
  console.log('8. 실제 적용된 스타일 확인:');
  
  // Header 컨테이너의 실제 padding 값 확인
  if (header) {
    const headerContainer = header.querySelector('.container');
    if (headerContainer) {
      const styles = window.getComputedStyle(headerContainer);
      const pyValue = styles.paddingTop || styles.paddingBottom;
      const pxValue = styles.paddingLeft || styles.paddingRight;
      console.log(`   - Header padding: ${pxValue} (좌우), ${pyValue} (상하)`);
      console.log(`   - 수정 후 예상: px-2 (8px), py-1 (4px)`);
      const headerPy = parseInt(pyValue) || 0;
      const headerPx = parseInt(pxValue) || 0;
      console.log(`   - ${headerPy <= 5 && headerPx <= 10 ? '✅ 수정됨' : '❌ 수정 안됨 (예상: py-1=4px, px-2=8px)'}`);
    }
  }
  
  // Main 컨테이너의 실제 padding 값 확인
  if (main) {
    const styles = window.getComputedStyle(main);
    const pyValue = styles.paddingTop || styles.paddingBottom;
    const pxValue = styles.paddingLeft || styles.paddingRight;
    console.log(`   - Main padding: ${pxValue} (좌우), ${pyValue} (상하)`);
    console.log(`   - 수정 후 예상: px-2 (8px), py-2 (8px)`);
    const mainPy = parseInt(pyValue) || 0;
    const mainPx = parseInt(pxValue) || 0;
    console.log(`   - ${mainPy <= 10 && mainPx <= 10 ? '✅ 수정됨' : '❌ 수정 안됨 (예상: py-2=8px, px-2=8px)'}`);
  }
  
  // Tailwind CSS가 로드되었는지 확인 (모든 스타일시트 확인)
  const stylesheets = Array.from(document.styleSheets);
  const hasStyles = stylesheets.length > 0;
  console.log(`   - 스타일시트 개수: ${stylesheets.length}개`);
  console.log(`   - CSS 로드: ${hasStyles ? '✅ 로드됨' : '❌ 로드 안됨'}`);
  
  return {
    mainElements: mainElements.length,
    spaceYElements: spaceYElements.length,
    gapElements: gapElements.length,
    cssLoaded: hasStyles
  };
};

// 전역 함수로 등록
if (typeof window !== 'undefined') {
  (window as any).checkSpacing = checkSpacing;
}

