interface ShapeDefinition {
    createNodeShape: (element: d3.Selection<any, any, any, any>, size: number) => void;
    createFilterStyle: () => string;
}

const shapeDefinitions: Record<string, ShapeDefinition> = {
    css: {
        createNodeShape: (element, size) => {
            element.append('path')
                .attr('d', `M0,${size} L${size},${-size} L${-size},${-size} Z`)
                .attr('class', 'node-shape');
        },
        createFilterStyle: () => `
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 14px solid var(--vscode-editor-foreground);
            transform: translate(-50%, -50%);
        `
    },
    js: {
        createNodeShape: (element, size) => {
            element.append('rect')
                .attr('x', -size)
                .attr('y', -size)
                .attr('width', size * 2)
                .attr('height', size * 2)
                .attr('class', 'node-shape');
        },
        createFilterStyle: () => `
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 12px;
            height: 12px;
            background: var(--vscode-editor-foreground);
            transform: translate(-50%, -50%);
            border-radius: 0;
        `
    },
    jsx: {
        createNodeShape: (element, size) => {
            element.append('circle')
                .attr('r', size)
                .attr('class', 'node-shape');
        },
        createFilterStyle: () => `
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 12px;
            height: 12px;
            background: var(--vscode-editor-foreground);
            border-radius: 50%;
            transform: translate(-50%, -50%);
        `
    },
    default: {
        createNodeShape: (element, size) => {
            element.append('circle')
                .attr('r', size)
                .attr('class', 'node-shape');
        },
        createFilterStyle: () => `
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 12px;
            height: 12px;
            background: var(--vscode-editor-foreground);
            border-radius: 50%;
            transform: translate(-50%, -50%);
        `
    }
};

function getShapeType(extension: string): string {
    if (extension.match(/\.css$/)) return 'css';
    if (extension.match(/\.(js|ts)$/)) return 'js';
    if (extension.match(/\.(jsx|tsx)$/)) return 'jsx';
    return 'default';
}

function updateFilterShapeStyles() {
    const styleSheet = document.createElement('style');
    Object.entries(shapeDefinitions).forEach(([type, def]) => {
        styleSheet.textContent += `
            .extension-shape.${type}::after {
                ${def.createFilterStyle()}
            }
        `;
    });
    document.head.appendChild(styleSheet);
}

// グローバルオブジェクトとして形状定義を提供
(window as any).shapes = {
    shapeDefinitions,
    getShapeType,
    updateFilterShapeStyles
}; 