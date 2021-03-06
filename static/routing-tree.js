// Setup

// Modify the diameter to expand/contract space between nodes.
var anchor = document.querySelector(".page-header").parentElement;
var diameter = anchor.clientWidth;

var color = "#e6522c";

var tree = d3.layout.tree()
    .size([360, diameter / 2 - 120])
    .separation(function(a, b) { return (a.parent == b.parent ? 1 : 2) / a.depth; });

var diagonal = d3.svg.diagonal.radial()
    .projection(function(d) { return [d.y, d.x / 180 * Math.PI]; });

var svg;

var tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("background-color", "white")
    .style("border", "1px solid #ddd")
    .style("font", "9px monospace")
    .style("padding", "4px 2px")
    .style("z-index", "10")
    .style("visibility", "hidden");

function parseSearch(searchString) {
  var labels = searchString.replace(/{|}|\"|\s/g, "").split(",");
  var o = {};
  labels.forEach(function(label) {
    var l = label.split("=");
    o[l[0]] = l[1];
  });
  return o;
}

function resetSVG() {
  d3.select(anchor).select("svg").remove()
  svg = d3.select(anchor).append("svg")
    .classed("routing-table", true)
    .attr("width", diameter)
    .attr("height", diameter - 150)
    .append("g")
    .attr("transform", "translate(" + diameter / 2 + "," + (diameter / 2 - 200) + ")");
}

// Click handler for reading config.yml
d3.select(".js-parse-and-draw").on("click", function() {
  var config = document.querySelector(".js-config-yml").value;
  var parsedConfig = jsyaml.load(config);

  // Create a new SVG for each time a config is loaded.
  resetSVG();
  loadConfig(parsedConfig);
});

// Click handler for input labelSet
d3.select(".js-find-match").on("click", function() {
  labelServiceHandler();
});

d3.select(document).on("keyup", function(e) {
  if (d3.event.keyCode != 13) {
    return;
  }
  labelServiceHandler();
});

function labelServiceHandler() {
  var searchValue = document.querySelector(".js-label-set-input").value
  var labelSet = parseSearch(searchValue);
  var matches = match(root, labelSet)
  var nodes = tree.nodes(root);
  var idx = nodes.map(function(n) { return n.id }).indexOf(matches[0].id)
  nodes.forEach(function(n) { n.matched = false });
  nodes[idx].matched = true;
  update(root);
}

// Match does a depth-first left-to-right search through the route tree
// and returns the matching routing nodes.
function match(root, labelSet) {
  // See if the node is a match. If it is, recurse through the children.
  if (!matchLabels(root.matchers, labelSet)) {
    return [];
  }

  var all = []

  if (root.children) {
    for (var j = 0; j < root.children.length; j++) {
      child = root.children[j];
      matches = match(child, labelSet)

      all = all.concat(matches);

      if (matches && !child.continue) {
        break;
      }
    }
  }

  // If no child nodes were matches, the current node itself is a match.
  if (all.length === 0) {
    all.push(root);
  }

  return all
}

// Compare set of matchers to labelSet
function matchLabels(matchers, labelSet) {
  for (var j = 0; j < matchers.length; j++) {
    if (!matchLabel(matchers[j], labelSet)) {
      return false;
    }
  }
  return true;
}

// Compare single matcher to labelSet
function matchLabel(matcher, labelSet) {
  var v = labelSet[matcher.name];

  if (matcher.isRegex) {
    return matcher.value.test(v)
  }

  return matcher.value === v;
}

// Load the parsed config and create the tree
function loadConfig(config) {
  root = config.route;

  root.parent = null;
  massage(root)

  update(root);
}

// Translate AlertManager names to expected d3 tree names, convert AlertManager
// Match and MatchRE objects to js objects.
function massage(root) {
  if (!root) return;

  root.children = root.routes

  if (root.continue != false) {
    root.continue = true;
  }

  var matchers = []
  if (root.match) {
    for (var key in root.match) {
      var o = {};
      o.isRegex = false;
      o.value = root.match[key];
      o.name = key;
      matchers.push(o);
    }
  }

  if (root.match_re) {
    for (var key in root.match_re) {
      var o = {};
      o.isRegex = true;
      o.value = new RegExp(root.match_re[key]);
      o.name = key;
      matchers.push(o);
    }
  }

  root.matchers = matchers;

  if (!root.children) return;

  root.children.forEach(function(child) {
    child.parent = root;
    massage(child)
  });
}

// Update the tree based on root.
function update(root) {
  var i = 0;
  var nodes = tree.nodes(root);
  var links = tree.links(nodes);

  var matchedNode = nodes.find(function(n) { return n.matched })
  var highlight = [];
  if (matchedNode) {
    highlight = [matchedNode]
    while (matchedNode.parent) {
      highlight.push(matchedNode.parent);
      matchedNode = matchedNode.parent;
    }
  }

  var link = svg.selectAll(".link").data(links);

  var drawSimple = nodes.length < 3 ? true : false;
  if (drawSimple) {
    // Algorithm fails to assign x attributes if nodes.length < 3. For this
    // simple case, manually assign values.
    nodes.forEach(function(n, i) {
      n.x = i * 180 + 90;
    });
  }

  link.enter().append("path")
    .attr("class", "link")
    .attr("d", diagonal);

  if (highlight.length) {
    link.style("stroke", function(d) {
      if (highlight.indexOf(d.source) > -1 && highlight.indexOf(d.target) > -1) {
        return color
      }
      return "#ccc"
    });
  }

  var node = svg.selectAll(".node")
    .data(nodes, function(d) { return d.id || (d.id = ++i); });

  var nodeEnter = node.enter().append("g")
    .attr("class", "node")
    .attr("transform", function(d) {
      return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")";
    })

  nodeEnter.append("circle")
      .attr("r", 4.5);

  nodeEnter.append("text")
      .attr("dy", ".31em")
      .attr("text-anchor", function(d) { return d.x < 180 ? "start" : "end"; })
      .attr("transform", function(d) { return d.x < 180 ? "translate(8)" : "rotate(180)translate(-8)"; })
      .text(function(d) { return d.receiver; });

  node.select(".node circle").style("fill", function(d) {
    return d.matched ? color : "#fff";
  })
  .on("mouseover", function(d) {
    d3.select(this).style("fill", color);

    // Show all matchers for node and ancestors
    matchers = aggregateMatchers(d);
    text = formatMatcherText(matchers);
    text.forEach(function(t) {
      tooltip.append("div").text(t);
    });
    if (text.length) {
      return tooltip.style("visibility", "visible");
    }
  })
  .on("mousemove", function() {
    return tooltip.style("top", (d3.event.pageY-10)+"px").style("left",(d3.event.pageX+10)+"px");
  })
  .on("mouseout", function(d) {
    d3.select(this).style("fill", d.matched ? color : "#fff");
    tooltip.text("");
    return tooltip.style("visibility", "hidden");
  });
}

function formatMatcherText(matchersArray) {
  return matchersArray.map(function(m) {
    return m.name + ": " + m.value;
  });
}

function aggregateMatchers(node) {
  var n = node
  matchers = [];
  while (n.parent) {
    matchers = matchers.concat(n.matchers);
    n = n.parent;
  }
  return matchers
}
