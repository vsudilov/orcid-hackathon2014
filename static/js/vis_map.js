function vis_map(data){
  //Object responsible for storing data filters
  //and returning a filtered (original) dataset based on these
  
  var DataFilter = {
    //filters contain functions that return true|false.
    //true=throw away that datum; false=keep that datum.
    //
    //The testing logic is wrapped in these functions--The
    //DataFilter object is agnostic of what that is.
    filters: [],
    run: function () { 
      var filteredData = []
      var filters = this.filters
      $.each(data,function(d_index,datum){
        for (var i = 0; i<filters.length; i++ ) { //difficult to break nested $.each(); fallback to native forloop
          if ( filters[i].filter(datum) ) {
            filteredData.push(datum)
            break;
          }
        }
      })
      var newVisData = $.grep(data,function(x) {return $.inArray(x, filteredData) < 0}) //difference (set)
      return newVisData
    },
    removePreviousFiltersByType: function(t) {
      var newFilters = []
      $.each(this.filters,function(index,val){
        if (val.type != t) {
          newFilters.push(val)
        }
      })
      this.filters = newFilters
    },
  }

  //Analyze input dataset to set proper limits/scales on the visualization
  var colors = d3.scale.category20()
  var categories = {}

  $.each(data,function(index,v){
    if ( !(v.category in categories) ) {
      categories[v.category] = {color: colors(Object.keys(categories).length)}
    }
  })

  var legend = d3.select('#group-selection-widget ul')
    .selectAll('li')
    .data(Object.keys(categories))
    .enter()
    .append('li')
      .text(function(d){return d})
      .attr('class','active')
      .style('color',function(d) {return categories[d].color })
  
  legend.on('click',function(d){
    var toggleActive = function (ele) {
      if ( ele.hasClass('active') ) {
        ele.removeClass('active')
      } else {
        ele.addClass('active')
      }
    }
    //first toggle css class...this causes problems if we rapid-fire toggles with d3.transitions!
    toggleActive($(this))
    //second hook into the filter pipeline
    DataFilter.removePreviousFiltersByType('categoryFilter')
    $.each($('#group-selection-widget li:not(.active)'),function(index,val){
      var filter = {
        type:'categoryFilter',
        testCase: val.textContent,
        filter: function(datum){
          //if the test passes, then we filter it (return true=don't show this datum)
          return (datum.category == this.testCase) ? true:false
        },
      }
      DataFilter.filters.push(filter)
    })
    updateVis(DataFilter.run())
  })

  var daterange = [d3.min(data,function(d){return d.date}),d3.max(data, function(d){return d.date})]

  var rscale = d3.scale.linear()
    .domain([d3.min(data,function(d){return d.duration}),d3.max(data, function(d){return d.duration})])
    .range([70,5500])
    .nice();
  //

  //jquery-ui slider setup
  $( "#year-slider" ).slider({
    range: true,
    min: daterange[0],
    max: daterange[1],
    values: daterange,
    change: function (event, ui ){
      DataFilter.removePreviousFiltersByType('yearFilter')
      var filter = {
        type:'yearFilter',
        testCase: [ui.values[0],ui.values[1]],
        filter: function(datum){
          //if the test passes, then we filter it (return true=don't show this datum)
          return (datum.date >= this.testCase[0] && datum.date <= this.testCase[1]) ? false:true
        },
      }
      DataFilter.filters.push(filter)
      updateVis(DataFilter.run())
    },
    slide: function( event, ui ) {
      $( "#slider-label-text" ).val( ui.values.join(' - ') );
    }
  });
    //Set the initial values outside of change, so we don't have to put null checking logic in the event handler
  $( "#slider-label-text" ).val( daterange.join(' - '))
  //


  //var width = 256*5, //5 tiles of 256 pixels each.
  var width = Math.max(600, window.innerWidth*0.6),
      height = Math.max(400, window.innerHeight*0.8);

  var tile = d3.geo.tile()
      .size([width, height]);

  var projection = d3.geo.mercator()
      //.scale((1 << 12) / 2 / Math.PI)
      .scale(200)
      .translate([width / 2, height / 2]);

  var center = projection([0, 0]);
  
  var zoom = d3.behavior.zoom()
      .scale(projection.scale() * 2 * Math.PI)
      .scaleExtent([1 << 9, 1 << 16])
      .translate([width - center[0], height - center[1]])
      .on("zoom", zoomed);

  // With the center computed, now adjust the projection such that
  // it uses the zoom behavior’s translate and scale.
  projection
      .scale(1 / 2 / Math.PI)
      .translate([0, 0]);

  var svg = d3.select("#svg-container-vis_map").append("svg")
      .attr("class",'map')
      .attr("width", width)
      .attr("height", height);

  var raster = svg.append("g");

  var bubbleG = svg.append("g")
      .attr("transform", "translate(" + zoom.translate() + ")scale(" + zoom.scale() + ")");

  var bubbles = bubbleG.selectAll(".bubble")
      .data(data)
  bubbles.enter()
      .append("g")
        .attr("transform",function(d){return "translate("+projection([d.lng,d.lat])+")scale("+projection.scale()+")"})
        .attr("class","bubble")

  bubbles.append("circle")
      .attr("fill",function(d) {return categories[d.category].color})
        
  // var text = bubbles.append("text")
  //      .attr("text-anchor","middle")
  //      //.attr("transform", 'translate(0,-18)')
  //      .attr('fill','red')
  //      .attr('font-size',10)
  //      .text(function(d) {
  //        return d.name;
  //      });

  svg.call(zoom)
  zoomed()

  function zoomed() {
    var tiles = tile
        .scale(zoom.scale())
        .translate(zoom.translate())
        ();

    bubbleG
     .attr("transform",function(d){return "translate("+zoom.translate()+")scale("+zoom.scale()+")"})
          
    bubbleG
      .selectAll("circle")
      .attr('r', function(d) { return Math.sqrt(rscale(d.duration))/zoom.scale()})
      .append('svg:title')
      .text(function(d) { return d.name; });

    // text
    //   .attr('font-size',100/zoom.scale())

    var image = raster
        .attr("transform", "scale(" + tiles.scale + ")translate(" + tiles.translate + ")")
      .selectAll("image")
        .data(tiles, function(d) { return d; });

    image.exit()
        .remove();

    image.enter().append("image")
//        .attr("xlink:href", function(d) { return "http://" + ["a", "b", "c", "d"][Math.random() * 4 | 0] + ".tiles.mapbox.com/v3/examples.map-vyofok3q/" + d[2] + "/" + d[0] + "/" + d[1] + ".png"; })
        .attr("xlink:href", function(d) { return "http://" + ["a", "b", "c", "d"][Math.random() * 4 | 0] + ".tile.stamen.com/toner/" + d[2] + "/" + d[0] + "/" + d[1] + ".png"; })
        .attr("width", 1)
        .attr("height", 1)
        .attr("x", function(d) { return d[0]; })
        .attr("y", function(d) { return d[1]; })
        .style("opacity",0.4)
  }

  function updateVis(newVisData) {
    var bg = bubbleG.selectAll('.bubble')
      .data(newVisData, function(d) {return d.name})

    var exit = bg.exit()
    exit.transition().duration(500)
      .selectAll("circle")
      .attr("r",1e-5)
    exit.transition().delay(500).remove()

    var enter = bg.enter()
      .append("g")
        .attr("transform",function(d){return "translate("+projection([d.lng,d.lat])+")scale("+projection.scale()+")"})
        .attr("class","bubble")

    var c = enter.append("circle")
      .attr("fill",function(d) {return categories[d.category].color})
      .attr("r",1e-5)    
      .transition().duration(500)
      .attr("r", function(d) { return Math.sqrt(rscale(d.duration))/zoom.scale()})
      .append('svg:title')
      .text(function(d) { return d.name; });
  }

}