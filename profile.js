function MoarProfiler(rawData) {
    // Extract some common things out of the raw data.
    var nodeIdToName = {};
    var nodeIdToFile = {};
    var nodeIdToLine = {};
    (function () {
        function walkCallGraphNode(node) {
            if (!nodeIdToName[node.id]) {
                nodeIdToName[node.id] = node.name == "" ? "<anon>"    : node.name;
                nodeIdToLine[node.id] = node.line < 1   ? "<unknown>" : node.line;
                nodeIdToFile[node.id] = node.file == "" ? "<unknown>" : node.file;
            }
            if (node.callees)
                node.callees.map(walkCallGraphNode);
        }
        walkCallGraphNode(rawData[0].call_graph);
    }());

    this.rawData = rawData;
    this.nodeIdToName = nodeIdToName;
    this.nodeIdToFile = nodeIdToFile;
    this.nodeIdToLine = nodeIdToLine;
}

MoarProfiler.prototype.overview = function ($scope) {
    rawData = this.rawData;
    nodeIdToName = this.nodeIdToName;
    nodeIdToFile = this.nodeIdToFile;
    nodeIdToLine = this.nodeIdToLine;

    var totalTime     = rawData[0].total_time;
    var speshTime     = rawData[0].spesh_time;
    var gcTime        = 0;
    var gcNursery     = 0;
    var gcFull        = 0;
    var gcNurseryTime = 0;
    var gcFullTime    = 0;
    var totalEntries  = 0;
    var inlineEntries = 0;
    var jitEntries    = 0;
    var speshEntries  = 0;
    var deoptOnes     = 0;
    var deoptAlls     = 0;
    var osrs          = 0;
    rawData[0].gcs.map(function (gc) {
        gcTime += gc.time;
        if (gc.full) {
            gcFull++;
            gcFullTime += gc.time;
        }
        else {
            gcNursery++;
            gcNurseryTime += gc.time;
        }
    });
    function walkCallGraphNode(node) {
        totalEntries  += node.entries;
        inlineEntries += node.inlined_entries;
        speshEntries  += node.spesh_entries;
        jitEntries    += node.jit_entries;
        deoptOnes     += node.deopt_one;
        deoptAlls     += node.deopt_all;
        osrs          += node.osr;
        if (node.callees)
            node.callees.map(walkCallGraphNode);
    }
    walkCallGraphNode(rawData[0].call_graph);
    
    // Time spent
    var overheadTime            = speshTime + gcTime;
    var executingTime           = totalTime - overheadTime;
    $scope.TotalTime            = +(totalTime / 1000).toFixed(2);
    $scope.OverheadTime         = +(overheadTime / 1000).toFixed(2);
    $scope.OverheadTimePercent  = +(100 * overheadTime / totalTime).toFixed(2);
    $scope.ExecutingTime        = +(executingTime / 1000).toFixed(2);
    $scope.ExecutingTimePercent = +(100 * executingTime / totalTime).toFixed(2);
    $scope.GCTime               = +(gcTime / 1000).toFixed(2);
    $scope.GCTimePercent        = +(100 * gcTime / totalTime).toFixed(2);
    $scope.SpeshTime            = +(speshTime / 1000).toFixed(2);
    $scope.SpeshTimePercent     = +(100 * speshTime / totalTime).toFixed(2);

    // Routines
    var interpEntries           = totalEntries - (jitEntries + speshEntries);
    $scope.EntriesWithoutInline = totalEntries - inlineEntries;
    $scope.EntriesInline        = inlineEntries;
    $scope.InlinePercent        = +(100 * inlineEntries / totalEntries).toFixed(2);
    $scope.InterpFrames         = interpEntries;
    $scope.InterpFramesPercent  = +(100 * interpEntries / totalEntries).toFixed(2);
    $scope.SpeshFrames          = speshEntries;
    $scope.SpeshFramesPercent   = +(100 * speshEntries / totalEntries).toFixed(2);
    $scope.JITFrames            = jitEntries;
    $scope.JITFramesPercent     = +(100 * jitEntries / totalEntries).toFixed(2);

    // Garbage collection
    $scope.GCRuns         = gcNursery + gcFull;
    $scope.FullGCRuns     = gcFull;
    $scope.NurseryAverage = +((gcNurseryTime / 1000) / gcNursery).toFixed(2);
    $scope.FullAverage    = +((gcFullTime / 1000) / gcFull).toFixed(2);

    // Dynamic optimization
    var optimizedFrames    = speshEntries + jitEntries;
    $scope.OptimizedFrames = optimizedFrames;
    $scope.DeoptOnes       = deoptOnes; 
    $scope.DeoptOnePercent = +(100 * deoptOnes / (optimizedFrames || 1)).toFixed(2);
    $scope.DeoptAlls       = deoptAlls;
    $scope.OSRs            = osrs;
};

MoarProfiler.prototype.routines = function ($scope) {
    rawData = this.rawData;
    nodeIdToName = this.nodeIdToName;
    nodeIdToFile = this.nodeIdToFile;
    nodeIdToLine = this.nodeIdToLine;

    // Walk call graph to build data.
    var idToEntries      = {};
    var idToSpeshEntries = {};
    var idToJITEntries   = {};
    var idToExclusive    = {};
    var idToInclusive    = {};
    var idToOSR          = {};
    var idRecDepth       = {};
    var totalExclusive   = 0;
    var totalInclusive   = rawData[0].call_graph.inclusive_time;
    function walkCallGraphNode(node) {
        if (!idToEntries[node.id]) {
            idToEntries[node.id]      = 0;
            idToSpeshEntries[node.id] = 0;
            idToJITEntries[node.id]   = 0;
            idToExclusive[node.id]    = 0;
            idToInclusive[node.id]    = 0;
            idToOSR[node.id]          = false;
            idRecDepth[node.id]       = 0;
        }
        idToEntries[node.id]      += node.entries;
        idToSpeshEntries[node.id] += node.spesh_entries;
        idToJITEntries[node.id]   += node.jit_entries;
        idToExclusive[node.id]    += node.exclusive_time;
        totalExclusive            += node.exclusive_time;
        if (node.osr > 0)
            idToOSR[node.id] = true;
        if (idRecDepth[node.id] == 0)
            idToInclusive[node.id] += node.inclusive_time;
        if (node.callees) {
            idRecDepth[node.id]++;
            node.callees.map(walkCallGraphNode);
            idRecDepth[node.id]--;
        }
    }
    walkCallGraphNode(rawData[0].call_graph);

    // Build object list per routine.
    var routineList = [];
    for (id in idToEntries) {
        var speshEntriesPercent  = +(100 * idToSpeshEntries[id] / idToEntries[id]).toFixed(2);
        var jitEntriesPercent    = +(100 * idToJITEntries[id] / idToEntries[id]).toFixed(2);
        var interpEntriesPercent = 100 - (speshEntriesPercent + jitEntriesPercent);
        var entry = {
            Name:                 nodeIdToName[id],
            Line:                 nodeIdToLine[id],
            File:                 nodeIdToFile[id],
            Entries:              idToEntries[id],
            InterpEntriesPercent: interpEntriesPercent,
            SpeshEntriesPercent:  speshEntriesPercent,
            JITEntriesPercent:    jitEntriesPercent,
            InclusiveTime:        +(idToInclusive[id] / 1000).toFixed(2),
            InclusiveTimePercent: +(100 * idToInclusive[id] / totalInclusive).toFixed(2),
            ExclusiveTime:        +(idToExclusive[id] / 1000).toFixed(2),
            ExclusiveTimePercent: +(100 * idToExclusive[id] / totalExclusive).toFixed(2),
            OSR:                  idToOSR[id]
        };
        routineList.push(entry);
    }
    $scope.Routines  = routineList;
    $scope.predicate = "InclusiveTimePercent";
    $scope.reverse   = true;
};

MoarProfiler.prototype.callGraph = function ($scope) {
    rawData = this.rawData;
    nodeIdToName = this.nodeIdToName;
    nodeIdToFile = this.nodeIdToFile;
    nodeIdToLine = this.nodeIdToLine;

    $scope.Current       = rawData[0].call_graph;
    $scope.total_time    = rawData[0].total_time;
    $scope.SuchCallers   = false;
    $scope.RecentCallers = [];
    $scope.predicate     = "TimePercent";
    $scope.reverse       = true;
    var all_callers      = [];
    updateCurrentData();

    $scope.toCallee = function (callee) {
        // Update caller history.
        all_callers.push($scope.Current);
        $scope.RecentCallers.push($scope.Current);
        if ($scope.RecentCallers.length > 5)
            $scope.RecentCallers.shift();

        // Update current node and callees.
        $scope.Current = callee;
        updateCurrentData();
    };

    $scope.toCaller = function (caller) {
        // Update caller history.
        while (all_callers.length > 0) {
            var removed = all_callers.pop();
            if ($scope.RecentCallers.length > 0)
                $scope.RecentCallers.pop();
            if (removed == caller)
                break;
        }
        if (all_callers.length > $scope.RecentCallers.length) {
            var ptr = all_callers.length - $scope.RecentCallers.length;
            while (ptr >= 0 && $scope.RecentCallers.length < 5) {
                $scope.RecentCallers.unshift(all_callers[ptr]);
                ptr--;
            }
        }

        // Update current node and callees.
        $scope.Current = caller;
        updateCurrentData();
    }

    /*
        * Given a callee, create a unique, repeatable color;
        * h/t https://stackoverflow.com/questions/3426404
        */
    $scope.backgroundColor = function (callee) {
        var str = callee.$$hashKey + callee.file + callee.name;
        for (var i = 0, hash = 0; i < str.length; hash = str.charCodeAt(i++) + ((hash << 5) - hash));
        for (var i = 0, colour = "#"; i < 3; colour += ("00" + ((hash >> i++ * 8) & 0xFF).toString(16)).slice(-2));
        return colour;
    }

    function updateCurrentData() {
        // Line and file.
        var current = $scope.Current;
        $scope.Line = current.line;
        $scope.File = current.file;

        // Entry statistics.
        var interpEntries    = current.entries - (current.spesh_entries + current.jit_entries);
        var nonInlineEntries = current.entries - current.inlined_entries;
        $scope.Entries       = nonInlineEntries;
        $scope.Percent       = (100 * nonInlineEntries / current.entries).toFixed(2);
        $scope.InlineEntries = current.inlined_entries;
        $scope.InlinePercent = (100 * current.inlined_entries / current.entries).toFixed(2);
        $scope.InterpEntries = interpEntries;
        $scope.InterpPercent = (100 * interpEntries / current.entries).toFixed(2);
        $scope.SpeshEntries  = current.spesh_entries;
        $scope.SpeshPercent  = (100 * current.spesh_entries / current.entries).toFixed(2);
        $scope.JITEntries    = current.jit_entries;
        $scope.JITPercent    = (100 * current.jit_entries / current.entries).toFixed(2);

        // Callees.
        $scope.Callees = calleesOf(current);
    }

    function calleesOf(node) {
        if (!node.callees)
            return [];

        var totalExclusive = 0.0;
        node.callees.map(function (c) { totalExclusive += c.exclusive_time; });

        return node.callees.map(function (c) {
            var speshCallsPercent  = +(100 * c.spesh_entries / c.entries).toFixed(2);
            var jitCallsPercent    = +(100 * c.jit_entries / c.entries).toFixed(2);
            var interpCallsPercent = 100 - (speshCallsPercent + jitCallsPercent);
            var inlinedPercent     = +(100 * c.inlined_entries / c.entries).toFixed(2);
            return {
                Name:               nodeIdToName[c.id],
                Line:               nodeIdToLine[c.id],
                File:               nodeIdToFile[c.id],
                Calls:              c.entries,
                Time:               +(c.inclusive_time / 1000).toFixed(2),
                TimePercent:        +(100 * c.inclusive_time / node.inclusive_time).toFixed(2),
                InterpCallsPercent: interpCallsPercent,
                SpeshCallsPercent:  speshCallsPercent,
                JITCallsPercent:    jitCallsPercent,
                InlinedPercent:     inlinedPercent,
                VeryInline:         inlinedPercent >= 95,
                SometimesInline:    inlinedPercent < 95 && inlinedPercent > 10,
                Node:               c
            };
        });
    }
};

MoarProfiler.prototype.allocations = function ($scope) {
    rawData = this.rawData;
    nodeIdToName = this.nodeIdToName;
    nodeIdToFile = this.nodeIdToFile;
    nodeIdToLine = this.nodeIdToLine;

    // Traverse all call nodes, counting up the allocations.
    var typeIdToName         = {};
    var typeIdToAllocations  = {};
    var typeIdToAllocationsByType  = {};
    var typeIdToRoutineStats = {};
    var maxAllocations       = 1;
    function walkCallGraphNode(node) {
        node.allocations.map(function (alloc) {
            if (!typeIdToName[alloc.id]) {
                typeIdToName[alloc.id]         = alloc.type == "" ? "<anon>" : alloc.type;
                typeIdToAllocations[alloc.id]  = 0;
                typeIdToAllocationsByType[alloc.id] = [0, 0, 0];
                typeIdToRoutineStats[alloc.id] = {};
            }
            typeIdToAllocations[alloc.id] += alloc.count;
            typeIdToAllocationsByType[alloc.id][0] += alloc.count - alloc.spesh - alloc.jit;
            typeIdToAllocationsByType[alloc.id][1] += alloc.spesh;
            typeIdToAllocationsByType[alloc.id][2] += alloc.jit;
            if (typeIdToAllocations[alloc.id] > maxAllocations)
                maxAllocations = typeIdToAllocations[alloc.id];
            if (typeIdToRoutineStats[alloc.id][node.id]) {
                typeIdToRoutineStats[alloc.id][node.id]['count'] += alloc.count;
                typeIdToRoutineStats[alloc.id][node.id]['spesh'] += alloc.spesh;
                typeIdToRoutineStats[alloc.id][node.id]['jit'] += alloc.jit;
            } else {
                typeIdToRoutineStats[alloc.id][node.id] = {
                    count: alloc.count,
                    spesh: alloc.spesh,
                    jit: alloc.jit
                    };
            }
        });
        if (node.callees) {
            node.callees.map(walkCallGraphNode);
        }
    }
    walkCallGraphNode(rawData[0].call_graph);

    // Build allocation summary.
    var allocationSummary = [];
    for (id in typeIdToName) {
        var maxAllocationByRoutine = 1;
        for (var rid in typeIdToRoutineStats[id])
            if (typeIdToRoutineStats[id][rid]['count'] > maxAllocationByRoutine)
                maxAllocationByRoutine = typeIdToRoutineStats[id][rid]['count'];
        var routineStats = [];
        for (var rid in typeIdToRoutineStats[id])
            routineStats.push({
                Name:               nodeIdToName[rid],
                Line:               nodeIdToLine[rid],
                File:               nodeIdToFile[rid],
                Allocations:        typeIdToRoutineStats[id][rid]['count'],
                AllocationsSpesh:   typeIdToRoutineStats[id][rid]['spesh'],
                AllocationsJit:     typeIdToRoutineStats[id][rid]['jit'],
                AllocationsPercent: (100 * typeIdToRoutineStats[id][rid]['count'] / maxAllocationByRoutine),
                AllocationsInterpPercent: (100 * (typeIdToRoutineStats[id][rid]['count'] - typeIdToRoutineStats[id][rid]['jit'] - typeIdToRoutineStats[id][rid]['spesh'])  / maxAllocationByRoutine),
                AllocationsSpeshPercent:  (100 * typeIdToRoutineStats[id][rid]['spesh'] / maxAllocationByRoutine),
                AllocationsJitPercent:    (100 * typeIdToRoutineStats[id][rid]['jit'] / maxAllocationByRoutine)
            });
        var entry = {
            Name:                 typeIdToName[id],
            Allocations:          typeIdToAllocations[id],
            AllocationsPercent:   +(100 * typeIdToAllocations[id] / maxAllocations).toFixed(2),
            AllocationsInterpPercent: +(100 * typeIdToAllocationsByType[id][0] / maxAllocations).toFixed(2),
            AllocationsSpeshPercent:  +(100 * typeIdToAllocationsByType[id][1] / maxAllocations).toFixed(2),
            AllocationsJitPercent:    +(100 * typeIdToAllocationsByType[id][2] / maxAllocations).toFixed(2),
            RoutineStats:         routineStats
        };
        allocationSummary.push(entry);
    }
    $scope.AllocationSummary = allocationSummary;
    $scope.predicate         = "Allocations";
    $scope.reverse           = true;
    $scope.routinePredicate  = "Allocations";
    $scope.routineReverse    = true;

    // Allocating routines handlng.
    $scope.showAllocatingRoutines = function (alloc) {
        // Show modal dialog with data.
        $scope.CurrentAllocatingRoutine      = alloc.Name;
        $scope.CurrentAllocatingRoutineStats = alloc.RoutineStats;
        var modalInstance = $modal.open({
            templateUrl: 'myModalContent.html',
            scope: $scope
        });
    }
};

MoarProfiler.prototype.gc = function ($scope) {
    rawData = this.rawData;
    nodeIdToName = this.nodeIdToName;
    nodeIdToFile = this.nodeIdToFile;
    nodeIdToLine = this.nodeIdToLine;

    // Find longest GC run.
    var longestGC = 0;
    rawData[0].gcs.map(function (gc) {
        if (gc.time > longestGC)
            longestGC = gc.time;
    });

    // Produce something nice to render.
    var run = 0;
    $scope.GCs = rawData[0].gcs.map(function (gc) {
        var totalBytes = gc.cleared_bytes + gc.retained_bytes + gc.promoted_bytes;
        return {
            Run:               ++run,
            Time:              +(gc.time / 1000).toFixed(2),
            Full:              (gc.full != 0),
            TimePercent:       +(100 * gc.time / longestGC).toFixed(2),
            RetainedKilobytes: Math.round(gc.retained_bytes / 1024),
            PromotedKilobytes: Math.round(gc.promoted_bytes / 1024),
            ClearedKilobytes:  Math.round(gc.cleared_bytes / 1024),
            RetainedPercent:   +(100 * gc.retained_bytes / totalBytes).toFixed(2),
            PromotedPercent:   +(100 * gc.promoted_bytes / totalBytes).toFixed(2),
            ClearedPercent:    +(100 * gc.cleared_bytes / totalBytes).toFixed(2),
            Gen2Roots:         'gen2_roots' in gc ? gc.gen2_roots : 0
        };
    });
    $scope.predicate = 'Run';
    $scope.reverse = false;
};

MoarProfiler.prototype.gc = function ($scope) {
    rawData = this.rawData;

    // Walk call graph to build data.
    var idToOSR          = {};
    var idToDeoptOne     = {};
    var idToDeoptAll     = {};
    var maxOSR           = 1;
    var maxDeoptOne      = 1;
    var maxDeoptAll      = 1;
    function walkCallGraphNode(node) {
        if (!idToOSR[node.id]) {
            idToOSR[node.id]      = 0;
            idToDeoptOne[node.id] = 0;
            idToDeoptAll[node.id] = 0;
        }
        idToOSR[node.id]      += node.osr;
        idToDeoptOne[node.id] += node.deopt_one;
        idToDeoptAll[node.id] += node.deopt_all;
        if (idToOSR[node.id] > maxOSR)
            maxOSR = idToOSR[node.id];
        if (idToDeoptOne[node.id] > maxDeoptOne)
            maxDeoptOne = idToDeoptOne[node.id];
        if (idToDeoptAll[node.id] > maxDeoptAll)
            maxDeoptAll = idToDeoptAll[node.id];
        if (node.callees)
            node.callees.map(walkCallGraphNode);
    }
    walkCallGraphNode(rawData[0].call_graph);

    // Build up OSR, deopt one, and deopt all tables.
    var osrs      = [];
    var deoptOnes = [];
    var deoptAlls = [];
    for (id in idToOSR) {
        if (idToOSR[id] > 0) {
            osrs.push({
                Name:    nodeIdToName[id],
                Line:    nodeIdToLine[id],
                File:    nodeIdToFile[id],
                Count:   idToOSR[id],
                Percent: Math.round(100 * idToOSR[id] / maxOSR)
            });
        }
        if (idToDeoptOne[id] > 0) {
            deoptOnes.push({
                Name:    nodeIdToName[id],
                Line:    nodeIdToLine[id],
                File:    nodeIdToFile[id],
                Count:   idToDeoptOne[id],
                Percent: Math.round(100 * idToDeoptOne[id] / maxDeoptOne)
            });
        }
        if (idToDeoptAll[id] > 0) {
            deoptAlls.push({
                Name:    nodeIdToName[id],
                Line:    nodeIdToLine[id],
                File:    nodeIdToFile[id],
                Count:   idToDeoptAll[id],
                Percent: Math.round(100 * idToDeoptAll[id] / maxDeoptAll)
            });
        }
    }
    $scope.OSRs      = osrs;
    $scope.DeoptOnes = deoptOnes;
    $scope.DeoptAlls = deoptAlls;
    $scope.predicate = 'Count';
    $scope.reverse   = true;
};

// npm install sprintf, lodash
var sprintf = require('sprintf'),
    _ = require('lodash');

function cli() {
    var fs=require('fs');
    var json = fs.readFileSync('/dev/stdin').toString();
    var rawData = JSON.parse(json);

    this.profiler = new MoarProfiler(rawData);
    this.show_overview();
    this.show_routines();
}
cli.prototype.show_overview = function () {
    var scope = {};
    this.profiler.overview(scope);
    console.log("\n\n================> OVERVIEW <====================\n");
    for (var k in scope) {
        console.log(sprintf("%-25s %10s", k, scope[k]));
    }
};
cli.prototype.show_routines = function () {
    var scope = {};
    this.profiler.routines(scope);

    function percentage(v) {
        return sprintf("%3.2f%%", v);
    }

    console.log("\n\n================> Routines(Order by Inclusive) <====================\n");
    _.sortBy(scope.Routines, v => v.InclusiveTime).reverse().slice(0, 20).forEach((r, i) => {
        console.log(sprintf("%3d %4d(%7s) %4d(%7s) %s %s %s", i,
                            r.InclusiveTime, percentage(r.InclusiveTimePercent),
                            r.ExclusiveTime, percentage(r.ExclusiveTimePercent),
                            r.Name, r.File, r.Line
                            ));
    });

    console.log("\n\n================> Routines(Order by Exclusive) <====================\n");
    _.sortBy(scope.Routines, v => v.ExclusiveTime).reverse().slice(0, 20).forEach((r, i) => {
        console.log(sprintf("%3d %4d(%7s) %4d(%7s) %s %s %s", i,
                            r.InclusiveTime, percentage(r.InclusiveTimePercent),
                            r.ExclusiveTime, percentage(r.ExclusiveTimePercent),
                            r.Name, r.File, r.Line
                            ));
    });
};


new cli();
