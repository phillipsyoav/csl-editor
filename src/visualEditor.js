"use strict";

var CSLEDIT = CSLEDIT || {};

CSLEDIT.editorPage = (function () {
	var editTimeout,
		styleURL,
		oldSelectedNode,
		hoveredNodeStack = [],
		highlightedCss,
		selectedCss,
		unHighlightedCss,
		highlightedTreeNodes = [],
		selectedCslId = -1,
		cslTreeView;

	var normalisedColor = function (color) {
		return $('<pre>').css({"color" : color}).css("color");
	};

	highlightedCss = {
			"color" : normalisedColor("black"),
			"background-color" : normalisedColor("#bbffbb"),
			"cursor" : "pointer"
		};
	selectedCss = {
			"color" : normalisedColor("white"),
			"background-color" : normalisedColor("#009900"),
			"cursor" : "default"
		};
	unHighlightedCss = {
			"color" : "",
			"background-color" : "",
			"cursor" : "default"
		};

	// resizing that can't be done with CSS
	var setSizes = function () {
		var mainContent = $('#mainContainer');

		mainContent.height(mainContent.parent().height() - 60);
		cslTreeView.jQueryElement.height(cslTreeView.jQueryElement.parent().height());
	};

	var addToHoveredNodeStack = function (target) {
		// build stack 'backwards' from the inner node outwards
		var parentNode;
		
		if (typeof target.attr("cslid") !== "undefined") {
			hoveredNodeStack.unshift(target.attr("cslid"));
		}

		parentNode = target.parent();
		if (parentNode.length > 0) {
			addToHoveredNodeStack(parentNode);
		}
	}

	var removeFromHoveredNodeStack = function (nodeIndex) {
		// pop all nodes up to and including the target node
		var poppedNode;

		if (hoveredNodeStack.length > 0) {
			poppedNode = hoveredNodeStack.pop();
			unHighlightNode(poppedNode);

			if (poppedNode == nodeIndex) {
				return;
			}
			removeFromHoveredNodeStack (nodeIndex);
		}
	}

	var highlightNode = function (nodeStack) {
		var cslId = nodeStack[nodeStack.length - 1];

		highlightOutput(cslId);

		// undo previous highlighting
		unHighlightTree();
		highlightTree(nodeStack, null, 0);
	};

	var highlightOutput = function (cslId)
	{
		var node = $('span[cslid="' + cslId + '"]');
		if (node.css("background-color") == selectedCss["background-color"])
		{
			// leave alone - selection takes precedence
		} else {
			node.css(highlightedCss);
		}
	};

	var reverseSelectNode = function () {
		var index,
			cslId = hoveredNodeStack[hoveredNodeStack.length - 1];

		assert(hoveredNodeStack.length > 0);

		for (index = 0; index < hoveredNodeStack.length; index++) {
			cslTreeView.expandNode(hoveredNodeStack[index]);
		}

		if (selectedCslId !== cslId) {
			selectedCslId = cslId;
			cslTreeView.selectNode(cslId);
		}
	};

	var unHighlightTree = function () {
		var node;

		while (highlightedTreeNodes.length > 0) {
			node = highlightedTreeNodes.pop();
			node.css(unHighlightedCss);
			node.css("cursor", "");
		}
	};

	// highlight node and all parents, stopping at the "style" node
	var highlightTree = function (nodeStack, node, depth) {
		var nodeIndex, node, parentNode, parentIndex, highlightedNode;

		if (node === null) {
			nodeIndex = nodeStack.pop();
			if (typeof nodeIndex === "undefined") {
				return;
			}
			node = $('li[cslid="' + nodeIndex + '"]');
		}

		depth++;
		assert(depth < 50, "stack overflow!");

		if (node.is('li')) {
			highlightedNode = node.children('a');
			highlightedTreeNodes.push(highlightedNode);
			highlightedNode.css(highlightedCss);
			highlightedNode.css("cursor", "");
		}

		parentNode = node.parent();
		assert(parentNode != false, "no parent node");

		parentIndex = parentNode.attr("cslid");

		if (parentIndex != "0") {
			if (nodeStack[nodeStack.length - 1] === parentIndex) {
				nodeStack.pop();
			}
			highlightTree(nodeStack, parentNode, depth);
		} else {
			// highlight any remaining nodes in the call stack
			// (e.g. if a macro was called)
			highlightTree(nodeStack, null, depth);
		}
	};

	var unHighlightNode = function (nodeIndex) {
		var	node = $('span[cslid="' + nodeIndex + '"]');

		if (node.css("background-color") == selectedCss["background-color"])
		{
			// leave alone - selection takes precedence
		} else {
			node.css(unHighlightedCss);
		}
	};

	var setupSyntaxHighlightForNode = function (cslId) {
		$('span[cslid="' + cslId + '"]').hover(
			function (event) {
				var target = $(event.target).closest("span[cslid]");
				
				// remove all
				removeFromHoveredNodeStack(-1);

				// populate hovered node stack
				addToHoveredNodeStack(target);

				var lastNode = hoveredNodeStack[hoveredNodeStack.length - 1];
				assertEqual(lastNode, target.attr("cslid"), "applySyntax");

				if (hoveredNodeStack.length > 0) {
					highlightNode(hoveredNodeStack.slice());
				}
			},
			function () {
				removeFromHoveredNodeStack(cslId);
				
				if (hoveredNodeStack.length > 0) {
					highlightNode(hoveredNodeStack.slice());
				} else {
					unHighlightTree();
				}
			}
		);

		// set up click handling
		$('span[cslid="' + cslId + '"]').click( function () {
			reverseSelectNode(cslId);
		});

		// set up hovering over tree nodes
		$('li[cslid="' + cslId + '"] > a').unbind('mouseenter mouseleave');
		$('li[cslid="' + cslId + '"] > a').hover(
			function () {
				highlightOutput(cslId);
			},
			function () {
				unHighlightNode(cslId);
			}
		);
	};

	var doSyntaxHighlighting = function () {
		console.time("syntaxHighlighting");
		// clear the hovered node stack
		hoveredNodeStack.length = 0;
		selectedCslId = -1;

		// syntax highlighting
		for (var index = 0; index < numCslNodes; index++) {
			setupSyntaxHighlightForNode(index);
		}
		console.timeEnd("syntaxHighlighting");
	};

	var createTreeView = function () {
		var nodeIndex = { index : 0 };
		var cslData = CSLEDIT.cslParser.cslDataFromCslCode(CSLEDIT.code.get(), nodeIndex);

		cslTreeView.createFromJsonData(cslData,
		{
			"loaded.jstree" : function (event, data) {
				//jsonData = treeEditor.jstree("get_json", -1, [], [])[0];

				CSLEDIT.citationEngine.runCiteprocAndDisplayOutput(
					$("#statusMessage"), $("#exampleOutput"),
					$("#formattedCitations"), $("#formattedBibliography"),
					doSyntaxHighlighting,
					CSLEDIT.cslParser.getFirstCslId(cslData, "citation"),
					CSLEDIT.cslParser.getFirstCslId(cslData, "bibliography"));
			},
			"move_node.jstree" : treeViewChanged,
			"select_node.jstree" : nodeSelected,
			"delete_node.jstree" : function () {
			if (confirm("Are you sure you want to delete this node?")) {
				treeViewChanged();
			} else {
				updateCslData(CSLEDIT.code.get());
			}
		});
	};

	var treeViewChanged = function () {
		jsonData = treeEditor.jstree("get_json", -1, [], [])[0];
		updateCslIds();
		formatExampleCitations();
	};

	var formatExampleCitations = function () {
		// TODO: remove, no longer reading data from the view
		//CSLEDIT.code.set(CSLEDIT.cslParser.cslXmlFromJson([jsonData]));

		CSLEDIT.citationEngine.runCiteprocAndDisplayOutput(
			$("#statusMessage"), $("#exampleOutput"),
			$("#formattedCitations"), $("#formattedBibliography"),
			doSyntaxHighlighting,
			CSLEDIT.cslParser.getFirstCslId(jsonData, "citation"),
			CSLEDIT.cslParser.getFirstCslId(jsonData, "bibliography"));
	};

	var nodeSelected = function(event, ui) {
		var nodeData = ui.rslt.obj.data();

		var propertyPanel = $("#elementProperties"),
			possibleElements,
			element,
			possibleChildNodesDropdown,
			schemaAttributes,
			schemaAttribute,
			valueIndex,
			schemaValues,
			parentNode,
			parentJsonData,
			parentNodeName,
			dataType;

		// parent node
		parentNode = ui.inst._get_parent(ui.rslt.obj);

		// hack to stop parent of style being style
		if (nodeData.name === "style") {
			parentNodeName = "root";
		} else if (parentNode !== false) {
			console.time("get parent");
			parentNodeName = parentNode.data().name;
			console.timeEnd("get parent");
		} else {
			parentNodeName = "root";
		}

		// update possible child elements based on schema
		if (typeof CSLEDIT.schema !== "undefined") {
			possibleElements = CSLEDIT.schema.childElements(parentNodeName + "/" + nodeData.name);

			possibleChildNodesDropdown = $("#possibleChildNodes").html("");

			for (element in possibleElements) {
				$('<li><a href="#">' + element + '</a></li>').appendTo(possibleChildNodesDropdown);
			}
		}

		// reregister dropdown handler after changes
		setupDropdownMenuHandler("#possibleChildNodes a");

		dataType = CSLEDIT.schema.elementDataType(parentNodeName + "/" + nodeData.name);
		schemaAttributes = CSLEDIT.schema.attributes(parentNodeName + "/" + nodeData.name);

		CSLEDIT.propertyPanel.setupPanel(
			$("#elementProperties"), nodeData, dataType, schemaAttributes, nodeChanged);

		$('span[cslid="' + oldSelectedNode + '"]').css(unHighlightedCss);
		oldSelectedNode = nodeData.cslId;

		$('span[cslid="' + nodeData.cslId + '"]').css(selectedCss);
	};

	var nodeChanged = function () {
		var selectedNodeId = cslTreeView.selectedNode,
			attributes = [];

		node = CSLEDIT.data.getNode(selectedNodeId);

		// TODO: assert check that persistent data wasn't changed in another tab, making
		//       this form data possibly refer to a different node

		// read user data
		var numAttributes = $('[id^="nodeAttributeLabel"]').length,
			index,
			key, value;

		console.time("readingUserInput");
		for (index = 0; index < numAttributes; index++) {
			key = $("#nodeAttributeLabel" + index).html();
			value = $("#nodeAttribute" + index).val();
			attributes.push({
				key : key,
				value : value,
				enabled : metadata.attributes[index].enabled
			});
		}
		console.timeEnd("readingUserInput");
		metadata.attributes = attributes;

		treeEditor.jstree("rename_node", selectedNode,
			CSLEDIT.cslParser.displayNameFromMetadata(metadata));
		formatExampleCitations();
	};

	var updateCslIds = function () {
		CSLEDIT.cslParser.updateCslIds(jsonData, {index:0});

		// update the html attributes to be in sync
		treeEditor.find("[cslid]").each(function (index) {
			var metadata = $(this).data();
			$(this).attr("cslid", metadata.cslId);
		});
	};

	var reloadPageWithNewStyle = function (newURL) {
		var reloadURL = window.location.href;
		reloadURL = reloadURL.replace(/#/, "");
		reloadURL = reloadURL.replace(/\?.*$/, "");
		window.location.href = reloadURL + "?styleURL=" + newURL;
	};

	var updateCslData = function (data) {
		// strip comments from style
		data = data.replace(/<!--.*?-->/g, "");

		CSLEDIT.code.set(data);
		createTreeView();
	};

	var setupDropdownMenuHandler = function (selector) {
		$(selector).click(function (event) {
			var clickedName = $(event.target).text(),
				selectedNodeId = $('#treeEditor').jstree('get_selected'),
				parentNode = $(event.target).parent().parent(),
				parentNodeName,
				position;

			if (parentNode.attr("class") === "sub_menu")
			{
				parentNodeName = parentNode.siblings('a').text();

				if (/^Edit/.test(parentNodeName)) {
					if (clickedName === "Delete node") {
						treeEditor.jstree('remove', selectedNode);
					}
				} else if ((/^Add node/).test(parentNodeName)) {
					$(event.target).parent().parent().css('visibility', 'hidden');

					// if current node is the root "style" node, create within instead of after
					if (selectedNode.data().name === "style") {
						position = "inside";
					} else {
						position = "inside";
					}
					
					// create new node after the selected one
					treeEditor.jstree('create_node', selectedNode, position,
					{
						"data" : clickedName,
						"attr" : { "rel" : clickedName, "cslid" : -1 },
						"metadata" : {
							"name" : clickedName,
							"attributes" : [],
							"textValue" : undefined,
							"cslId" : 0
						},
						"children" : []
					});

					treeEditor.jstree("open_node", 'li[cslid="-1"]');
					treeEditor.jstree("deselect_all");
					treeEditor.jstree("select_node", 'li[cslid="-1"]');
					treeViewChanged();

				} else if ((/^Style/).test(parentNodeName)) {
					if (clickedName === "Revert (undo all changes)") {
						reloadPageWithNewStyle(styleURL);
					} else if (clickedName === "Export CSL") {
						window.location.href =
							"data:application/xml;charset=utf-8," +
							encodeURIComponent(CSLEDIT.code.get());
					} else if (clickedName === "Load from URL") {
						reloadPageWithNewStyle(
							prompt("Please enter the URL of the style you wish to load")
						);
					} else if (clickedName === "New style") {
						reloadPageWithNewStyle(
							window.location.protocol + "//" + window.location.hostname + "/csl/content/newStyle.csl");
					}
				}
			}
		});
	};

	return {
		init : function () {
			var createNode = function (id) {
					return {
						"data" : "node " + id,
						"attr" : {"rel" : "generic"}
					};
				},
				index;
	
			cslTreeView = CSLEDIT.CslTreeView($("#treeEditor"));

			$("#dialog-confirm-delete").dialog({autoOpen : false});

			$(function(){
				$("ul.dropdown li").hover(function(){
				
					$(this).addClass("hover");
					$('ul:first',this).css('visibility', 'visible');
				
				}, function(){
				
					$(this).removeClass("hover");
					$('ul:first',this).css('visibility', 'hidden');
				
				});
				
				$("ul.dropdown li ul li:has(ul)").find("a:first").append(" &raquo; ");
			});

			CSLEDIT.code.initPageStyle( createTreeView );
			setupDropdownMenuHandler(".dropdown a");

			$(".propertyInput").on("change", nodeChanged);

			setSizes();
			$(window).resize(setSizes);
		}
	};
}());

$("document").ready( function () {
	CSLEDIT.schema.callWhenReady( CSLEDIT.editorPage.init );
});
