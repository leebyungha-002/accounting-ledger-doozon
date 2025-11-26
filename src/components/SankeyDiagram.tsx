/**
 * Sankey 다이어그램 컴포넌트
 * SVG를 사용하여 실제 Sankey 다이어그램 구현
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';

interface SankeyDiagramProps {
  nodes: string[];
  links: { source: number; target: number; value: number }[];
}

interface NodePosition {
  id: number;
  name: string;
  x: number;
  y: number;
  height: number;
  value: number;
}

interface LinkPath {
  source: NodePosition;
  target: NodePosition;
  value: number;
  path: string;
}

export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({ nodes, links }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    if (svgRef.current) {
      const updateDimensions = () => {
        const container = svgRef.current?.parentElement;
        if (container) {
          setDimensions({
            width: Math.max(container.clientWidth - 40, 1000),
            height: Math.max(container.clientHeight - 40, 600)
          });
        }
      };
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, []);

  const { nodePositions, linkPaths } = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) {
      return { nodePositions: [], linkPaths: [] };
    }

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    const nodeWidth = 200;
    const leftColumnX = margin.left;
    const rightColumnX = width - margin.right - nodeWidth;

    // 왼쪽 노드 (source)와 오른쪽 노드 (target) 분리
    const leftNodes = new Set<number>();
    const rightNodes = new Set<number>();
    links.forEach(link => {
      leftNodes.add(link.source);
      rightNodes.add(link.target);
    });

    // 왼쪽 노드별 총 outgoing 값 계산
    const leftNodeValues = new Map<number, number>();
    links.forEach(link => {
      const current = leftNodeValues.get(link.source) || 0;
      leftNodeValues.set(link.source, current + link.value);
    });

    // 오른쪽 노드별 총 incoming 값 계산
    const rightNodeValues = new Map<number, number>();
    links.forEach(link => {
      const current = rightNodeValues.get(link.target) || 0;
      rightNodeValues.set(link.target, current + link.value);
    });

    // 왼쪽 노드들을 값 기준으로 정렬
    const sortedLeftNodes = Array.from(leftNodes)
      .map(id => ({ id, name: nodes[id], value: leftNodeValues.get(id) || 0 }))
      .sort((a, b) => b.value - a.value);

    // 오른쪽 노드들을 값 기준으로 정렬
    const sortedRightNodes = Array.from(rightNodes)
      .map(id => ({ id, name: nodes[id], value: rightNodeValues.get(id) || 0 }))
      .sort((a, b) => b.value - a.value);

    // 총 높이 계산 (전체 링크 값의 합)
    const totalLinkValue = links.reduce((sum, link) => sum + link.value, 0);
    const totalLeftValue = sortedLeftNodes.reduce((sum, n) => sum + n.value, 0);
    const totalRightValue = sortedRightNodes.reduce((sum, n) => sum + n.value, 0);

    // 노드 위치 계산
    const nodePositions: NodePosition[] = [];
    let currentY = margin.top;

    // 왼쪽 노드들
    sortedLeftNodes.forEach(node => {
      // 노드 높이는 해당 노드의 총 흐름 값에 비례
      const nodeHeight = totalLeftValue > 0 ? (node.value / totalLeftValue) * height : 20;
      nodePositions.push({
        id: node.id,
        name: node.name,
        x: leftColumnX,
        y: currentY,
        height: Math.max(nodeHeight, 15), // 최소 15px
        value: node.value
      });
      currentY += nodeHeight + 1; // 1px 간격
    });

    currentY = margin.top;
    // 오른쪽 노드들
    sortedRightNodes.forEach(node => {
      // 노드 높이는 해당 노드의 총 흐름 값에 비례
      const nodeHeight = totalRightValue > 0 ? (node.value / totalRightValue) * height : 20;
      nodePositions.push({
        id: node.id,
        name: node.name,
        x: rightColumnX,
        y: currentY,
        height: Math.max(nodeHeight, 15), // 최소 15px
        value: node.value
      });
      currentY += nodeHeight + 1; // 1px 간격
    });

    // 링크 경로 생성 (Sankey 곡선)
    // 노드별로 링크를 그룹화하고 누적 높이를 계산
    const sourceLinkGroups = new Map<number, typeof links>();
    const targetLinkGroups = new Map<number, typeof links>();

    // 소스별/타겟별 링크 그룹화
    links.forEach(link => {
      if (!sourceLinkGroups.has(link.source)) {
        sourceLinkGroups.set(link.source, []);
      }
      sourceLinkGroups.get(link.source)!.push(link);

      if (!targetLinkGroups.has(link.target)) {
        targetLinkGroups.set(link.target, []);
      }
      targetLinkGroups.get(link.target)!.push(link);
    });

    // 각 그룹 내에서 값 기준으로 정렬
    sourceLinkGroups.forEach(linkGroup => linkGroup.sort((a, b) => b.value - a.value));
    targetLinkGroups.forEach(linkGroup => linkGroup.sort((a, b) => b.value - a.value));

    // 링크별 누적 위치 계산
    const sourceAccumulated = new Map<number, number>();
    const targetAccumulated = new Map<number, number>();

    const linkPaths: LinkPath[] = [];

    // 링크를 값 기준으로 정렬하여 큰 것부터 처리
    const sortedLinks = [...links].sort((a, b) => b.value - a.value);

    sortedLinks.forEach(link => {
      const sourceNode = nodePositions.find(n => n.id === link.source);
      const targetNode = nodePositions.find(n => n.id === link.target);
      
      if (!sourceNode || !targetNode) {
        return;
      }

      // 소스 노드에서의 총 값 계산
      const sourceTotal = sourceLinkGroups.get(link.source)?.reduce((sum, l) => sum + l.value, 0) || 1;
      const sourceStart = sourceAccumulated.get(link.source) || 0;
      
      // 타겟 노드에서의 총 값 계산
      const targetTotal = targetLinkGroups.get(link.target)?.reduce((sum, l) => sum + l.value, 0) || 1;
      const targetStart = targetAccumulated.get(link.target) || 0;

      // 링크 두께 (노드 높이에 비례하여 계산)
      const sourceLinkHeight = (link.value / sourceTotal) * sourceNode.height;
      const targetLinkHeight = (link.value / targetTotal) * targetNode.height;
      const linkWidth = Math.max(2, Math.min(sourceLinkHeight, targetLinkHeight));

      // 소스에서의 링크 시작 위치
      const sourceY = sourceNode.y + (sourceNode.height * sourceStart / sourceTotal) + linkWidth / 2;
      
      // 타겟에서의 링크 시작 위치
      const targetY = targetNode.y + (targetNode.height * targetStart / targetTotal) + linkWidth / 2;

      // 누적 위치 업데이트 (다음 링크를 위해)
      sourceAccumulated.set(link.source, sourceStart + link.value);
      targetAccumulated.set(link.target, targetStart + link.value);

      const sourceX = sourceNode.x + nodeWidth;
      const targetX = targetNode.x;

      // Sankey 곡선 경로 (위아래로 넓은 곡선)
      const controlPointOffset = (targetX - sourceX) * 0.5;
      
      const path = `M ${sourceX} ${sourceY - linkWidth / 2}
                    C ${sourceX + controlPointOffset} ${sourceY - linkWidth / 2}, 
                      ${targetX - controlPointOffset} ${targetY - linkWidth / 2}, 
                      ${targetX} ${targetY - linkWidth / 2}
                    L ${targetX} ${targetY + linkWidth / 2}
                    C ${targetX - controlPointOffset} ${targetY + linkWidth / 2}, 
                      ${sourceX + controlPointOffset} ${sourceY + linkWidth / 2}, 
                      ${sourceX} ${sourceY + linkWidth / 2}
                    Z`;

      linkPaths.push({
        source: sourceNode,
        target: targetNode,
        value: link.value,
        path
      });
    });

    return { nodePositions, linkPaths };
  }, [nodes, links, dimensions]);

  // 색상 팔레트
  const colors = [
    '#94a3b8', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#f97316', '#6366f1', '#ef4444', '#14b8a6'
  ];

  const getNodeColor = (index: number) => {
    return colors[index % colors.length];
  };

  if (nodes.length === 0 || links.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <p>표시할 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ minHeight: `${dimensions.height}px` }}>
      <div className="overflow-auto border rounded-lg bg-white p-4" style={{ height: `${dimensions.height}px` }}>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full"
        >
        {/* 링크 그리기 (뒤에 그려서 노드 아래에 위치) */}
        {linkPaths.map((linkPath, idx) => {
          // 색상을 링크별로 다르게 (그라데이션 효과)
          const hue = (idx * 137.508) % 360; // 골든 앵글 분산
          const color = `hsl(${hue}, 60%, 65%)`;
          
          return (
            <path
              key={idx}
              d={linkPath.path}
              fill={color}
              opacity={0.6}
              stroke="#1e293b"
              strokeWidth={0.5}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${linkPath.source.name} → ${linkPath.target.name}: ${linkPath.value}건`}</title>
            </path>
          );
        })}

        {/* 노드 그리기 */}
        {nodePositions.map((node, idx) => {
          const isLeft = node.x < dimensions.width / 2;
          const color = getNodeColor(idx);
          
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={200}
                height={node.height}
                fill={color}
                opacity={0.8}
                stroke="#1e293b"
                strokeWidth={1}
                rx={2}
                style={{ cursor: 'pointer' }}
              >
                <title>{`${node.name}: ${node.value}건`}</title>
              </rect>
              <text
                x={node.x + (isLeft ? 205 : -5)}
                y={node.y + node.height / 2}
                dy="0.35em"
                fill="#1e293b"
                fontSize="11"
                fontWeight="500"
                textAnchor={isLeft ? 'start' : 'end'}
                className="pointer-events-none select-none"
              >
                {node.name.length > 20 ? `${node.name.substring(0, 20)}...` : node.name}
              </text>
            </g>
          );
        })}
        </svg>
      </div>
    </div>
  );
};
