const SOURCE_FILE_NAME = "input.ts";

const elements = {
    sourceInput: document.getElementById("sourceInput"),
    parseButton: document.getElementById("parseButton"),
    sampleButton: document.getElementById("sampleButton"),
    clearButton: document.getElementById("clearButton"),
    stats: document.getElementById("stats"),
    diagnostics: document.getElementById("diagnostics"),
    tree: document.getElementById("tree"),
    graph: document.getElementById("graph"),
    treeCount: document.getElementById("treeCount"),
    graphCount: document.getElementById("graphCount")
};

const SAMPLE_SOURCE = `interface Renderable {
  render(): void;
}

interface BattleState {
  turn: number;
}

const createDefaultBattleState = (): BattleState => ({
  turn: 0
});

class SoundSource {
  private id: string;
  protected volume: number;

  constructor(id: string, volume = 1) {
    this.id = id;
    this.volume = volume;
  }

  play(): void {
    // ...
  }

  stop(): void {
    // ...
  }
}

class Mixer extends SoundSource implements Renderable {
  private channels: number;

  constructor(id: string, channels: number) {
    super(id);
    this.channels = channels;
  }

  render(): void {
    // ...
  }

  mix(): void {
    // ...
  }
}

function createMixer(id: string): Mixer {
  return new Mixer(id, 2);
}
`;

let network = null;

function init() {
    if (!elements.sourceInput) {
        return;
    }

    elements.sampleButton.addEventListener("click", () => {
        elements.sourceInput.value = SAMPLE_SOURCE;
        parseAndRender();
    });

    elements.clearButton.addEventListener("click", () => {
        elements.sourceInput.value = "";
        parseAndRender();
    });

    elements.parseButton.addEventListener("click", () => {
        parseAndRender();
    });

    elements.sourceInput.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            parseAndRender();
        }
    });

    elements.sourceInput.value = SAMPLE_SOURCE;
    parseAndRender();
}

function parseAndRender() {
    if (!ensureTypescript()) {
        return;
    }

    const sourceText = elements.sourceInput.value.trim();
    if (!sourceText) {
        renderEmptyState();
        return;
    }

    const sourceFile = ts.createSourceFile(
        SOURCE_FILE_NAME,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    const analysis = analyzeSource(sourceFile);

    renderStats(analysis);
    renderDiagnostics(sourceFile);
    renderTree(analysis);
    renderGraph(analysis);
}

function ensureTypescript() {
    if (!window.ts) {
        setDiagnostics("Diagnostics", ["TypeScript library not loaded. Check CDN access."]);
        return false;
    }
    return true;
}

function renderEmptyState() {
    renderStats(createEmptyAnalysis());
    setDiagnostics("Diagnostics", ["Paste TypeScript to see diagnostics."]);
    elements.tree.innerHTML = "<div class=\"empty\">Paste TypeScript to see the structure tree.</div>";
    elements.graph.innerHTML = "<div class=\"empty\">Paste TypeScript to see the graph.</div>";
    elements.treeCount.textContent = "0 nodes";
    elements.graphCount.textContent = "0 edges";
    destroyNetwork();
}

function analyzeSource(sourceFile) {
    const classes = [];
    const functions = [];
    const functionObjects = [];
    const interfaces = [];
    const enums = [];

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isClassDeclaration(node)) {
            classes.push(parseClass(node, sourceFile));
        } else if (ts.isFunctionDeclaration(node)) {
            const name = node.name ? node.name.getText(sourceFile) : null;
            if (name) {
                const params = getParameterList(node, sourceFile);
                functions.push({
                    name,
                    display: `${name}(${params})`
                });
            }
        } else if (ts.isVariableStatement(node)) {
            const varKind = getVariableKind(node.declarationList.flags);
            const isExported = Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);
            node.declarationList.declarations.forEach((decl) => {
                const parsed = parseFunctionObject(decl, sourceFile, varKind, isExported);
                if (parsed) {
                    functionObjects.push(parsed);
                }
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            interfaces.push({ name: node.name.getText(sourceFile) });
        } else if (ts.isEnumDeclaration(node)) {
            enums.push({ name: node.name.getText(sourceFile) });
        }
    });

    return { classes, functions, functionObjects, interfaces, enums };
}

function parseClass(node, sourceFile) {
    const name = node.name ? node.name.getText(sourceFile) : "(anonymous class)";
    const heritage = { extends: null, implements: [] };

    if (node.heritageClauses) {
        node.heritageClauses.forEach((clause) => {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
                heritage.extends = clause.types[0].expression.getText(sourceFile);
            }
            if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                clause.types.forEach((type) => {
                    heritage.implements.push(type.expression.getText(sourceFile));
                });
            }
        });
    }

    const members = {
        constructors: [],
        methods: [],
        properties: []
    };

    node.members.forEach((member) => {
        if (ts.isConstructorDeclaration(member)) {
            members.constructors.push(buildMember("constructor", member, sourceFile));
        } else if (ts.isMethodDeclaration(member)) {
            members.methods.push(buildMember("method", member, sourceFile));
        } else if (ts.isGetAccessorDeclaration(member)) {
            members.methods.push(buildMember("get", member, sourceFile));
        } else if (ts.isSetAccessorDeclaration(member)) {
            members.methods.push(buildMember("set", member, sourceFile));
        } else if (ts.isPropertyDeclaration(member)) {
            members.properties.push(buildProperty(member, sourceFile));
        }
    });

    return { name, heritage, members };
}

function buildMember(kind, node, sourceFile) {
    const name = getNodeName(node, sourceFile);
    const params = getParameterList(node, sourceFile);
    let display = "";

    if (kind === "constructor") {
        display = `constructor(${params})`;
    } else if (kind === "get") {
        display = `get ${name}()`;
    } else if (kind === "set") {
        display = `set ${name}(${params})`;
    } else {
        display = `${name}(${params})`;
    }

    return {
        name,
        display,
        tags: getModifierTags(node)
    };
}

function buildProperty(node, sourceFile) {
    const name = getNodeName(node, sourceFile);
    const tags = getModifierTags(node);
    if (node.questionToken) {
        tags.push("optional");
    }

    return {
        name,
        display: name,
        tags
    };
}

function getNodeName(node, sourceFile) {
    if (!node.name) {
        return "(anonymous)";
    }

    if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
        return node.name.text;
    }

    return node.name.getText(sourceFile);
}

function getParameterList(node, sourceFile) {
    if (!node.parameters || node.parameters.length === 0) {
        return "";
    }

    return node.parameters
        .map((param) => param.name.getText(sourceFile))
        .join(", ");
}

function getVariableKind(flags) {
    if (flags & ts.NodeFlags.Const) {
        return "const";
    }
    if (flags & ts.NodeFlags.Let) {
        return "let";
    }
    return "var";
}

function parseFunctionObject(declaration, sourceFile, varKind, isExported) {
    if (!declaration.initializer) {
        return null;
    }
    if (!ts.isIdentifier(declaration.name)) {
        return null;
    }

    const initializer = declaration.initializer;
    const isArrow = ts.isArrowFunction(initializer);
    const isFunctionExpression = ts.isFunctionExpression(initializer);

    if (!isArrow && !isFunctionExpression) {
        return null;
    }

    const params = getParameterList(initializer, sourceFile);
    const name = declaration.name.text;
    const tags = [varKind, isArrow ? "arrow" : "function"];

    if (isExported) {
        tags.push("export");
    }

    if (ts.getCombinedModifierFlags(initializer) & ts.ModifierFlags.Async) {
        tags.push("async");
    }

    return {
        name,
        display: `${name}(${params})`,
        tags
    };
}

function getModifierTags(node) {
    const tags = [];
    const flags = ts.getCombinedModifierFlags(node);

    if (flags & ts.ModifierFlags.Private) {
        tags.push("private");
    }
    if (flags & ts.ModifierFlags.Protected) {
        tags.push("protected");
    }
    if (flags & ts.ModifierFlags.Static) {
        tags.push("static");
    }
    if (flags & ts.ModifierFlags.Readonly) {
        tags.push("readonly");
    }
    if (flags & ts.ModifierFlags.Abstract) {
        tags.push("abstract");
    }

    return tags;
}

function renderStats(analysis) {
    const counts = getCounts(analysis);
    const items = [
        { label: "Classes", value: counts.classes },
        { label: "Constructors", value: counts.constructors },
        { label: "Methods", value: counts.methods },
        { label: "Properties", value: counts.properties },
        { label: "Functions", value: counts.functions },
        { label: "Function Objects", value: counts.functionObjects },
        { label: "Interfaces", value: counts.interfaces },
        { label: "Enums", value: counts.enums }
    ];

    elements.stats.innerHTML = items
        .map(
            (item) => `
                <div class="stat">
                    <span class="stat-label">${item.label}</span>
                    <span class="stat-value">${item.value}</span>
                </div>
            `.trim()
        )
        .join("");
}

function getCounts(analysis) {
    const classes = analysis.classes.length;
    const functions = analysis.functions.length;
    const functionObjects = analysis.functionObjects.length;
    const interfaces = analysis.interfaces.length;
    const enums = analysis.enums.length;

    let constructors = 0;
    let methods = 0;
    let properties = 0;

    analysis.classes.forEach((cls) => {
        constructors += cls.members.constructors.length;
        methods += cls.members.methods.length;
        properties += cls.members.properties.length;
    });

    return {
        classes,
        functions,
        functionObjects,
        interfaces,
        enums,
        constructors,
        methods,
        properties
    };
}

function renderDiagnostics(sourceFile) {
    const diagnostics = sourceFile.parseDiagnostics || [];

    if (diagnostics.length === 0) {
        setDiagnostics("Diagnostics", ["No parse errors."]);
        return;
    }

    const lines = diagnostics.map((diag) => {
        const message = ts.flattenDiagnosticMessageText(diag.messageText, " ");
        if (typeof diag.start === "number") {
            return `${message} (pos ${diag.start})`;
        }
        return message;
    });

    setDiagnostics("Diagnostics", lines);
}

function setDiagnostics(title, lines) {
    elements.diagnostics.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = title;
    elements.diagnostics.appendChild(heading);

    lines.forEach((line) => {
        const entry = document.createElement("div");
        entry.textContent = line;
        elements.diagnostics.appendChild(entry);
    });
}

function renderTree(analysis) {
    elements.tree.innerHTML = "";

    const totalEntries =
        analysis.classes.length +
        analysis.functions.length +
        analysis.functionObjects.length +
        analysis.interfaces.length +
        analysis.enums.length;

    if (totalEntries === 0) {
        elements.tree.innerHTML = "<div class=\"empty\">No structures found.</div>";
        elements.treeCount.textContent = "0 nodes";
        return;
    }

    const root = buildTreeModel(analysis);
    const rootList = document.createElement("ul");
    rootList.appendChild(buildTreeNode(root));
    elements.tree.appendChild(rootList);

    const nodeCount = countTreeNodes(root) - 1;
    elements.treeCount.textContent = `${nodeCount} nodes`;
}

function buildTreeModel(analysis) {
    const root = {
        label: SOURCE_FILE_NAME,
        tags: ["file"],
        children: []
    };

    root.children.push({
        label: `Classes (${analysis.classes.length})`,
        children: analysis.classes.map((cls) => buildClassTree(cls))
    });

    root.children.push({
        label: `Functions (${analysis.functions.length})`,
        children: analysis.functions.map((fn) => ({
            label: fn.display
        }))
    });

    root.children.push({
        label: `Function Objects (${analysis.functionObjects.length})`,
        children: analysis.functionObjects.map((fn) => ({
            label: fn.display,
            tags: fn.tags
        }))
    });

    root.children.push({
        label: `Interfaces (${analysis.interfaces.length})`,
        children: analysis.interfaces.map((item) => ({
            label: item.name
        }))
    });

    root.children.push({
        label: `Enums (${analysis.enums.length})`,
        children: analysis.enums.map((item) => ({
            label: item.name
        }))
    });

    return root;
}

function buildClassTree(cls) {
    const tags = [];
    if (cls.heritage.extends) {
        tags.push(`extends ${cls.heritage.extends}`);
    }
    if (cls.heritage.implements.length > 0) {
        tags.push(`implements ${cls.heritage.implements.join(", ")}`);
    }

    const children = [];

    if (cls.members.constructors.length > 0) {
        children.push({
            label: `Constructors (${cls.members.constructors.length})`,
            children: cls.members.constructors.map((member) => ({
                label: member.display,
                tags: member.tags
            }))
        });
    }

    if (cls.members.methods.length > 0) {
        children.push({
            label: `Methods (${cls.members.methods.length})`,
            children: cls.members.methods.map((member) => ({
                label: member.display,
                tags: member.tags
            }))
        });
    }

    if (cls.members.properties.length > 0) {
        children.push({
            label: `Properties (${cls.members.properties.length})`,
            children: cls.members.properties.map((member) => ({
                label: member.display,
                tags: member.tags
            }))
        });
    }

    if (children.length === 0) {
        children.push({
            label: "No members"
        });
    }

    return {
        label: cls.name,
        tags,
        children
    };
}

function buildTreeNode(node) {
    const listItem = document.createElement("li");
    const label = document.createElement("span");
    label.className = "label";

    const text = document.createElement("span");
    text.textContent = node.label;
    label.appendChild(text);

    if (node.tags && node.tags.length > 0) {
        node.tags.forEach((tag) => {
            const tagEl = document.createElement("span");
            tagEl.className = "tag";
            tagEl.textContent = tag;
            label.appendChild(tagEl);
        });
    }

    listItem.appendChild(label);

    if (node.children && node.children.length > 0) {
        const list = document.createElement("ul");
        node.children.forEach((child) => {
            list.appendChild(buildTreeNode(child));
        });
        listItem.appendChild(list);
    }

    return listItem;
}

function countTreeNodes(node) {
    let count = 1;
    if (!node.children) {
        return count;
    }
    node.children.forEach((child) => {
        count += countTreeNodes(child);
    });
    return count;
}

function renderGraph(analysis) {
    destroyNetwork();

    const totalEntries =
        analysis.classes.length +
        analysis.functions.length +
        analysis.functionObjects.length +
        analysis.interfaces.length +
        analysis.enums.length;

    if (totalEntries === 0) {
        elements.graph.innerHTML = "<div class=\"empty\">No structures found.</div>";
        elements.graphCount.textContent = "0 edges";
        return;
    }

    if (!window.vis) {
        elements.graph.innerHTML = "<div class=\"empty\">Graph library not loaded.</div>";
        elements.graphCount.textContent = "0 edges";
        return;
    }

    elements.graph.innerHTML = "";
    const graphData = buildGraphData(analysis);

    const options = {
        layout: {
            improvedLayout: true
        },
        physics: {
            stabilization: {
                iterations: 120
            },
            barnesHut: {
                gravitationalConstant: -2800,
                springLength: 140,
                springConstant: 0.04
            }
        },
        interaction: {
            hover: true
        },
        nodes: {
            borderWidth: 1,
            size: 14,
            font: {
                color: "#e5e7eb",
                face: "Segoe UI"
            }
        },
        edges: {
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 0.6
                }
            },
            color: {
                color: "#64748b"
            },
            font: {
                color: "#94a3b8",
                size: 10
            },
            smooth: {
                type: "dynamic"
            }
        },
        groups: {
            file: {
                shape: "box",
                color: {
                    background: "#0f172a",
                    border: "#38bdf8"
                }
            },
            class: {
                shape: "box",
                color: {
                    background: "#0f172a",
                    border: "#38bdf8"
                }
            },
            method: {
                shape: "ellipse",
                color: {
                    background: "#1e1b4b",
                    border: "#a5b4fc"
                }
            },
            property: {
                shape: "dot",
                color: {
                    background: "#f59e0b",
                    border: "#fbbf24"
                }
            },
            function: {
                shape: "ellipse",
                color: {
                    background: "#064e3b",
                    border: "#34d399"
                }
            },
            interface: {
                shape: "box",
                color: {
                    background: "#3f1d31",
                    border: "#f472b6"
                }
            },
            enum: {
                shape: "box",
                color: {
                    background: "#1f2937",
                    border: "#cbd5f5"
                }
            },
            external: {
                shape: "box",
                color: {
                    background: "#1f2937",
                    border: "#94a3b8"
                }
            }
        }
    };

    network = new vis.Network(elements.graph, graphData, options);
    elements.graphCount.textContent = `${graphData.edgeCount} edges`;
}

function buildGraphData(analysis) {
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    const definedClasses = new Set(analysis.classes.map((cls) => cls.name));
    const definedInterfaces = new Set(analysis.interfaces.map((item) => item.name));

    function addNode(id, label, group) {
        if (nodeIds.has(id)) {
            return;
        }
        nodes.push({
            id,
            label,
            group
        });
        nodeIds.add(id);
    }

    function addEdge(from, to, label, dashes) {
        edges.push({
            from,
            to,
            label: label || "",
            arrows: "to",
            dashes: Boolean(dashes)
        });
    }

    const fileId = `file:${SOURCE_FILE_NAME}`;
    addNode(fileId, SOURCE_FILE_NAME, "file");

    analysis.classes.forEach((cls) => {
        const classId = `class:${cls.name}`;
        addNode(classId, cls.name, "class");
        addEdge(fileId, classId);

        cls.members.constructors.forEach((member) => {
            const nodeId = `ctor:${cls.name}.${member.display}`;
            addNode(nodeId, member.display, "method");
            addEdge(classId, nodeId);
        });

        cls.members.methods.forEach((member) => {
            const nodeId = `method:${cls.name}.${member.display}`;
            addNode(nodeId, member.display, "method");
            addEdge(classId, nodeId);
        });

        cls.members.properties.forEach((member) => {
            const nodeId = `prop:${cls.name}.${member.display}`;
            addNode(nodeId, member.display, "property");
            addEdge(classId, nodeId);
        });

        if (cls.heritage.extends) {
            const baseName = cls.heritage.extends;
            const { id, group } = resolveHeritageNode(baseName, definedClasses, definedInterfaces);
            addNode(id, baseName, group);
            addEdge(classId, id, "extends", true);
        }

        cls.heritage.implements.forEach((iface) => {
            const { id, group } = resolveHeritageNode(iface, definedClasses, definedInterfaces, true);
            addNode(id, iface, group);
            addEdge(classId, id, "implements", true);
        });
    });

    analysis.functions.forEach((fn) => {
        const nodeId = `function:${fn.name}`;
        addNode(nodeId, fn.display, "function");
        addEdge(fileId, nodeId);
    });

    analysis.functionObjects.forEach((fn) => {
        const nodeId = `function-object:${fn.name}`;
        addNode(nodeId, fn.display, "function");
        addEdge(fileId, nodeId);
    });

    analysis.interfaces.forEach((item) => {
        const nodeId = `interface:${item.name}`;
        addNode(nodeId, item.name, "interface");
        addEdge(fileId, nodeId);
    });

    analysis.enums.forEach((item) => {
        const nodeId = `enum:${item.name}`;
        addNode(nodeId, item.name, "enum");
        addEdge(fileId, nodeId);
    });

    return {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges),
        nodeCount: nodes.length,
        edgeCount: edges.length
    };
}

function resolveHeritageNode(name, definedClasses, definedInterfaces, preferInterface) {
    if (!preferInterface && definedClasses.has(name)) {
        return { id: `class:${name}`, group: "class" };
    }
    if (definedInterfaces.has(name)) {
        return { id: `interface:${name}`, group: "interface" };
    }
    if (definedClasses.has(name)) {
        return { id: `class:${name}`, group: "class" };
    }
    return { id: `external:${name}`, group: "external" };
}

function destroyNetwork() {
    if (network) {
        network.destroy();
        network = null;
    }
}

function createEmptyAnalysis() {
    return {
        classes: [],
        functions: [],
        functionObjects: [],
        interfaces: [],
        enums: []
    };
}

document.addEventListener("DOMContentLoaded", init);
