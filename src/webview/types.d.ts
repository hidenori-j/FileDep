interface GraphNode {
    id: number;
    name: string;
    fullPath: string;
    dirPath: string;
    connections: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

interface GraphLink {
    source: number;
    target: number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

// D3.jsの型拡張
declare module 'd3' {
    export function forceSimulation(nodes: GraphNode[]): Simulation<GraphNode, GraphLink>;
    export function forceLink(links: GraphLink[]): Force<GraphNode, GraphLink>;
    export function forceManyBody(): Force<GraphNode, GraphLink>;
    export function forceCenter(x: number, y: number): Force<GraphNode, GraphLink>;
    export function forceCollide(): Force<GraphNode, GraphLink>;
    
    interface Simulation<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>> {
        force(name: string, force: Force<N, L> | null): this;
        alpha(value: number): this;
        alphaTarget(value: number): this;
        alphaDecay(value: number): this;
        alphaMin(value: number): this;
        restart(): this;
        stop(): this;
        nodes(): N[];
        nodes(nodes: N[]): this;
    }

    interface Force<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>> {
        strength(strength: number): this;
        distance(distance: number): this;
        radius(radius: number): this;
        distanceMax(max: number): this;
    }
}

declare namespace vis {
    class Network {
        constructor(
            container: HTMLElement,
            data: { nodes: DataSet<any>; edges: DataSet<any> },
            options?: any
        );
        
        on(event: string, callback: (params: NetworkEvents) => void): void;
        setData(data: { nodes: DataSet<any>; edges: DataSet<any> }): void;
    }

    class DataSet<T> {
        constructor(data: T[]);
    }

    interface NetworkEvents {
        nodes: string[];
        edges: string[];
        event: Event;
    }
} 