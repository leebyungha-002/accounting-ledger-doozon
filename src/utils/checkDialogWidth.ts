/**
 * 분석화면(Dialog)의 폭이 최초화면 대비 몇 %인지 확인하는 유틸리티
 */

export const checkDialogWidth = () => {
  console.log('=== 분석화면 폭 확인 ===\n');

  // 실제 DOM에서 확인
  const mainContainer = document.querySelector('div.min-h-screen.bg-background');
  // DialogContent 찾기 (더 정확하게)
  const dialog = document.querySelector('[role="dialog"]');
  const dialogContent = dialog?.querySelector('div[class*="fixed"][class*="max-w"]') ||
                        dialog?.querySelector('div.fixed') ||
                        dialog?.querySelector('div:first-child');
  
  let mainMaxWidth = '0px';
  let mainActualWidth = 0;
  let dialogMaxWidth = '0px';
  let dialogActualWidth = 0;
  
  if (mainContainer) {
    const mainStyles = window.getComputedStyle(mainContainer);
    mainMaxWidth = mainStyles.maxWidth;
    mainActualWidth = mainContainer.getBoundingClientRect().width;
    console.log(`📏 최초화면:`);
    console.log(`   - max-width (설정값): ${mainMaxWidth}`);
    console.log(`   - 실제 너비: ${mainActualWidth.toFixed(2)}px`);
    console.log(`   - 화면 대비: ${(mainActualWidth / window.innerWidth * 100).toFixed(1)}%\n`);
  }
  
  if (dialogContent) {
    const dialogStyles = window.getComputedStyle(dialogContent);
    dialogMaxWidth = dialogStyles.maxWidth;
    dialogActualWidth = dialogContent.getBoundingClientRect().width;
    console.log(`📏 분석화면:`);
    console.log(`   - max-width (설정값): ${dialogMaxWidth}`);
    console.log(`   - 실제 너비: ${dialogActualWidth.toFixed(2)}px`);
    console.log(`   - 화면 대비: ${(dialogActualWidth / window.innerWidth * 100).toFixed(1)}%\n`);
  }
  
  // 비교 계산
  if (mainActualWidth > 0 && dialogActualWidth > 0) {
    const ratio = ((dialogActualWidth / mainActualWidth) * 100).toFixed(1);
    const reduction = ((1 - dialogActualWidth / mainActualWidth) * 100).toFixed(1);
    const pxDiff = (mainActualWidth - dialogActualWidth).toFixed(2);
    
    console.log('='.repeat(50));
    console.log(`📊 비교 결과:`);
    console.log(`   - 최초화면 실제 너비: ${mainActualWidth.toFixed(2)}px`);
    console.log(`   - 분석화면 실제 너비: ${dialogActualWidth.toFixed(2)}px`);
    console.log(`   - 차이: ${pxDiff}px`);
    console.log(`   - 분석화면은 최초화면의 ${ratio}%`);
    console.log(`   - ${reduction}% 감소됨`);
    console.log('='.repeat(50));
    
    return {
      mainMaxWidth,
      mainActualWidth,
      dialogMaxWidth,
      dialogActualWidth,
      ratio: parseFloat(ratio),
      reduction: parseFloat(reduction),
      pxDiff: parseFloat(pxDiff)
    };
  } else {
    console.log('⚠️ 분석화면이 열려있지 않거나 요소를 찾을 수 없습니다.');
    console.log('   분석화면을 먼저 열고 다시 확인해주세요.');
    return null;
  }
};

// 전역 함수로 등록
if (typeof window !== 'undefined') {
  (window as any).checkDialogWidth = checkDialogWidth;
}

