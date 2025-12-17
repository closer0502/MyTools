const SOURCE_FILE_NAME = "input.ts";

const elements = {
    sourceInput: document.getElementById("sourceInput"),
    parseButton: document.getElementById("parseButton"),
    sampleButton: document.getElementById("sampleButton"),
    clearButton: document.getElementById("clearButton"),
    stats: document.getElementById("stats"),
    diagnostics: document.getElementById("diagnostics"),
    tree: document.getElementById("tree"),
    headerView: document.getElementById("headerView"),
    graph: document.getElementById("graph"),
    treeCount: document.getElementById("treeCount"),
    graphCount: document.getElementById("graphCount"),
    copyTreeButton: document.getElementById("copyTreeButton"),
    downloadTreeButton: document.getElementById("downloadTreeButton")
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
let latestTreeModel = null;

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

    if (elements.copyTreeButton) {
        elements.copyTreeButton.addEventListener("click", handleCopyTree);
    }

    if (elements.downloadTreeButton) {
        elements.downloadTreeButton.addEventListener("click", handleDownloadTree);
    }

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
    latestTreeModel = renderTree(analysis);
    renderHeaderView(analysis);
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
    if (elements.headerView) {
        elements.headerView.textContent = "Paste TypeScript to see the header view.";
    }
    elements.graph.innerHTML = "<div class=\"empty\">Paste TypeScript to see the graph.</div>";
    elements.treeCount.textContent = "0 nodes";
    elements.graphCount.textContent = "0 edges";
    latestTreeModel = null;
    destroyNetwork();
}

function analyzeSource(sourceFile) {
    const classes = [];
    const functions = [];
    const functionObjects = [];
    const interfaces = [];
    const enums = [];
    const entries = [];

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isClassDeclaration(node)) {
            const parsed = parseClass(node, sourceFile);
            classes.push(parsed);
            entries.push({ kind: "class", data: parsed });
        } else if (ts.isFunctionDeclaration(node)) {
            const name = node.name ? node.name.getText(sourceFile) : null;
            if (name) {
                const params = getParameterList(node, sourceFile);
                const signature = buildFunctionSignature(
                    name,
                    getParameterSignature(node, sourceFile),
                    getReturnTypeText(node, sourceFile)
                );
                const parsed = {
                    name,
                    display: `${name}(${params})`,
                    signature
                };
                functions.push(parsed);
                entries.push({ kind: "function", data: parsed });
            }
        } else if (ts.isVariableStatement(node)) {
            const varKind = getVariableKind(node.declarationList.flags);
            const isExported = Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);
            node.declarationList.declarations.forEach((decl) => {
                const parsed = parseFunctionObject(decl, sourceFile, varKind, isExported);
                if (parsed) {
                    functionObjects.push(parsed);
                    entries.push({ kind: "function-object", data: parsed });
                }
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            const parsed = { name: node.name.getText(sourceFile) };
            interfaces.push(parsed);
            entries.push({ kind: "interface", data: parsed });
        } else if (ts.isEnumDeclaration(node)) {
            const parsed = { name: node.name.getText(sourceFile) };
            enums.push(parsed);
            entries.push({ kind: "enum", data: parsed });
        }
    });

    return { classes, functions, functionObjects, interfaces, enums, entries };
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
    const paramsSignature = getParameterSignature(node, sourceFile);
    const returnType = getReturnTypeText(node, sourceFile);
    let display = "";
    let signature = "";

    if (kind === "constructor") {
        display = `constructor(${params})`;
        signature = `constructor(${paramsSignature})`;
    } else if (kind === "get") {
        display = `get ${name}()`;
        signature = `get ${name}()${returnType ? `: ${returnType}` : ""}`;
    } else if (kind === "set") {
        display = `set ${name}(${params})`;
        signature = `set ${name}(${paramsSignature})`;
    } else {
        display = `${name}(${params})`;
        signature = `${name}(${paramsSignature})${returnType ? `: ${returnType}` : ""}`;
    }

    return {
        name,
        display,
        signature,
        tags: getModifierTags(node)
    };
}

function buildProperty(node, sourceFile) {
    const name = getNodeName(node, sourceFile);
    const tags = getModifierTags(node);
    if (node.questionToken) {
        tags.push("optional");
    }
    const optionalMark = node.questionToken ? "?" : "";
    const typeText = node.type ? node.type.getText(sourceFile) : "";
    const signature = typeText ? `${name}${optionalMark}: ${typeText};` : `${name}${optionalMark};`;

    return {
        name,
        display: name,
        signature,
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

function getParameterSignature(node, sourceFile) {
    if (!node.parameters || node.parameters.length === 0) {
        return "";
    }

    return node.parameters
        .map((param) => formatParameter(param, sourceFile))
        .join(", ");
}

function formatParameter(param, sourceFile) {
    let text = param.name.getText(sourceFile);
    if (param.questionToken) {
        text += "?";
    }
    if (param.type) {
        text += `: ${param.type.getText(sourceFile)}`;
    }
    if (param.initializer) {
        text += ` = ${param.initializer.getText(sourceFile)}`;
    }
    return text;
}

function getReturnTypeText(node, sourceFile) {
    return node.type ? node.type.getText(sourceFile) : "";
}

function buildFunctionSignature(name, params, returnType) {
    const suffix = returnType ? `: ${returnType}` : "";
    return `${name}(${params})${suffix}`;
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
    const paramsSignature = getParameterSignature(initializer, sourceFile);
    const name = declaration.name.text;
    const returnType =
        getReturnTypeText(initializer, sourceFile) || (declaration.type ? declaration.type.getText(sourceFile) : "");
    const tags = [varKind, isArrow ? "arrow" : "function"];
    const signature = buildFunctionSignature(name, paramsSignature, returnType);

    if (isExported) {
        tags.push("export");
    }

    if (ts.getCombinedModifierFlags(initializer) & ts.ModifierFlags.Async) {
        tags.push("async");
    }

    return {
        name,
        display: `${name}(${params})`,
        signature,
        tags
    };
}

function getModifierTags(node) {
    const tags = [];
    const flags = ts.getCombinedModifierFlags(node);

    if (flags & ts.ModifierFlags.Public) {
        tags.push("public");
    }
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

    elements.stats.innerHTML = `
        <ul class="stats-list">
            ${items
                .map(
                    (item) => `
                        <li class="stats-item">
                            <span class="stats-key">${item.label}</span>
                            <span class="stats-value">${item.value}</span>
                        </li>
                    `.trim()
                )
                .join("")}
        </ul>
    `.trim();
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
        return null;
    }

    const root = buildTreeModel(analysis);
    const rootList = document.createElement("ul");
    rootList.appendChild(buildTreeNode(root));
    elements.tree.appendChild(rootList);

    const nodeCount = countTreeNodes(root) - 1;
    elements.treeCount.textContent = `${nodeCount} nodes`;
    return root;
}

function renderHeaderView(analysis) {
    if (!elements.headerView) {
        return;
    }

    const text = buildHeaderText(analysis);
    elements.headerView.textContent = text || "No structures found.";
}

function buildHeaderText(analysis) {
    if (!analysis.entries || analysis.entries.length === 0) {
        return "";
    }

    const lines = [];

    analysis.entries.forEach((entry) => {
        if (lines.length > 0) {
            lines.push("");
        }

        if (entry.kind === "interface") {
            lines.push(`interface ${entry.data.name}`);
        } else if (entry.kind === "enum") {
            lines.push(`enum ${entry.data.name}`);
        } else if (entry.kind === "function-object") {
            lines.push(`object ${entry.data.signature || entry.data.display}`);
        } else if (entry.kind === "function") {
            lines.push(`function ${entry.data.signature || entry.data.display}`);
        } else if (entry.kind === "class") {
            lines.push(...buildClassHeaderLines(entry.data));
        }
    });

    return lines.join("\n");
}

function buildClassHeaderLines(cls) {
    const lines = [];
    let header = `class ${cls.name}`;

    if (cls.heritage.extends) {
        header += ` extends ${cls.heritage.extends}`;
    }
    if (cls.heritage.implements.length > 0) {
        header += ` implements ${cls.heritage.implements.join(", ")}`;
    }

    lines.push(header);

    const indent = "  ";
    const propLines = cls.members.properties.map((member) => `${indent}${formatModifierPrefix(member.tags)}${member.signature}`);
    const ctorLines = cls.members.constructors.map((member) => `${indent}${formatModifierPrefix(member.tags)}${member.signature}`);
    const methodLines = cls.members.methods.map((member) => `${indent}${formatModifierPrefix(member.tags)}${member.signature}`);

    const sections = [propLines, ctorLines, methodLines];
    sections.forEach((section, index) => {
        if (section.length === 0) {
            return;
        }
        lines.push(...section);
        const hasNext = sections.slice(index + 1).some((next) => next.length > 0);
        if (hasNext) {
            lines.push("");
        }
    });

    return lines;
}

function formatModifierPrefix(tags) {
    if (!tags || tags.length === 0) {
        return "";
    }

    const order = ["public", "protected", "private", "static", "readonly", "abstract"];
    const filtered = order.filter((tag) => tags.includes(tag));
    if (filtered.length === 0) {
        return "";
    }
    return `${filtered.join(" ")} `;
}

function buildTreeModel(analysis) {
    const root = {
        label: SOURCE_FILE_NAME,
        tags: ["file"],
        kind: "file",
        children: []
    };

    root.children.push({
        label: `Classes (${analysis.classes.length})`,
        kind: "group",
        children: analysis.classes.map((cls) => buildClassTree(cls))
    });

    root.children.push({
        label: `Functions (${analysis.functions.length})`,
        kind: "group",
        children: analysis.functions.map((fn) => ({
            label: fn.display,
            kind: "function"
        }))
    });

    root.children.push({
        label: `Function Objects (${analysis.functionObjects.length})`,
        kind: "group",
        children: analysis.functionObjects.map((fn) => ({
            label: fn.display,
            kind: "function-object",
            tags: fn.tags
        }))
    });

    root.children.push({
        label: `Interfaces (${analysis.interfaces.length})`,
        kind: "group",
        children: analysis.interfaces.map((item) => ({
            label: item.name,
            kind: "interface"
        }))
    });

    root.children.push({
        label: `Enums (${analysis.enums.length})`,
        kind: "group",
        children: analysis.enums.map((item) => ({
            label: item.name,
            kind: "enum"
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
            kind: "group",
            children: cls.members.constructors.map((member) => ({
                label: member.display,
                kind: "constructor",
                tags: member.tags
            }))
        });
    }

    if (cls.members.methods.length > 0) {
        children.push({
            label: `Methods (${cls.members.methods.length})`,
            kind: "group",
            children: cls.members.methods.map((member) => ({
                label: member.display,
                kind: "method",
                tags: member.tags
            }))
        });
    }

    if (cls.members.properties.length > 0) {
        children.push({
            label: `Properties (${cls.members.properties.length})`,
            kind: "group",
            children: cls.members.properties.map((member) => ({
                label: member.display,
                kind: "property",
                tags: member.tags
            }))
        });
    }

    if (children.length === 0) {
        children.push({
            label: "No members",
            kind: "muted"
        });
    }

    return {
        label: cls.name,
        tags,
        kind: "class",
        children
    };
}

function buildTreeNode(node) {
    const listItem = document.createElement("li");
    const label = document.createElement("span");
    label.className = "label";
    if (node.kind) {
        label.dataset.kind = node.kind;
    }

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
        enums: [],
        entries: []
    };
}

function handleCopyTree() {
    const treeText = getTreeText();
    if (!treeText) {
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
            .writeText(treeText)
            .then(() => {
                setDiagnostics("Diagnostics", ["Tree copied to clipboard."]);
            })
            .catch(() => {
                fallbackCopy(treeText);
            });
        return;
    }

    fallbackCopy(treeText);
}

function handleDownloadTree() {
    const treeText = getTreeText();
    if (!treeText) {
        return;
    }

    const blob = new Blob([treeText], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "structure-tree.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setDiagnostics("Diagnostics", ["Tree downloaded as TXT."]);
}

function getTreeText() {
    if (!latestTreeModel) {
        setDiagnostics("Diagnostics", ["Nothing to export. Paste TypeScript and analyze first."]);
        return "";
    }

    const lines = [];
    const indentUnit = "  ";

    function walk(node, depth) {
        const label = formatTreeLabel(node);
        if (label) {
            lines.push(`${indentUnit.repeat(depth)}${label}`);
        }
        if (node.children && node.children.length > 0) {
            node.children.forEach((child) => walk(child, depth + 1));
        }
    }

    walk(latestTreeModel, 0);
    return lines.join("\n");
}

function formatTreeLabel(node) {
    let label = node.label || "";
    if (node.kind === "group") {
        label = label.replace(/\s*\(\d+\)\s*$/, "");
    }
    if (node.tags && node.tags.length > 0) {
        label = `${label} [${node.tags.join(", ")}]`;
    }
    return label;
}

function fallbackCopy(text) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    document.body.removeChild(helper);
    setDiagnostics("Diagnostics", ["Tree copied to clipboard."]);
}

document.addEventListener("DOMContentLoaded", init);
