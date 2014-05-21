// var dateDiff = function (d1,d2) { 
//   var aDay = 24*60*60*1000;
//   return Math.abs((d1.getTime()-d2.getTime())/aDay);
// }

function submit(){
  var oid = $('input#oid').val()
  var api_query = 'http://pub.orcid.org/v1.2_rc4/'+oid+"/orcid-profile?callback=?"
  $.ajax({
    url: api_query,
    type: 'GET',
    dataType: 'json',
    success: function(data) {
      console.log(data)
      var d = data['orcid-profile']
      var employment = d['orcid-activities']['affiliations']['affiliation']
      var works = d['orcid-activities']['orcid-works']['orcid-work']
      var oid = d['orcid-identifier']['path']
      var name = d['orcid-bio']['personal-details']['family-name'].value+', '+d['orcid-bio']['personal-details']['given-names'].value
      $.each(employment,function(index,v) {
        var city = v['organization']['address']['city']
        var country = v['organization']['address']['country']
        var geocode_url = "https://maps.googleapis.com/maps/api/geocode/json?address="+city+'+,'+country
        // v.organization.lat = 42.3736158
        // v.organization.lng = -71.10973349999999
        $.ajax({
          url: geocode_url,
          async: false,
          success: function(data) {
            var lat = data.results[0].geometry.location.lat
            var lng = data.results[0].geometry.location.lng
            v['organization']['lat'] = lat
            v['organization']['lng'] = lng
          }
        })     
      })
      vis_map(name,oid,employment,works)
    }
  })
}

function vis_map(name,oid,employment,works){
  var data = employment
  //var width = 256*5, //5 tiles of 256 pixels each.
  var width = Math.max(600, window.innerWidth*0.6),
      height = Math.max(400, window.innerHeight*0.8);

  $.each(data,function(index,v){
    v.name = v['department-name']
    v.nworks = 0

    var getDate = function (d) {
      if (d.hasOwnProperty('year')) {
        var year = d['year'].value || 0
      } else {
        var year = 0
      }

      if (d.hasOwnProperty('month')) {
        var month = d['month'].value || 0
      } else {
        var month = 0
      }

      if (d.hasOwnProperty('day')) {
        var day = d['day'].value || 0
      } else {
        var day = 0
      }

      return new Date(year,month,day)
    }

    var sdate = getDate(v['start-date'])
    if (v.hasOwnProperty('end-date')) {
      var edate = getDate(v['end-date'])
    }
    else {
      var edate = new Date()
    }

    $.each(works,function(index,work){
      var pub_date = getDate(work['publication-date'])
      //var pub_date = new Date(work['publication-date'].year.value,work['publication-date'].month.value || 0,work['publication-date'].day.value || 0 )
      if (pub_date > sdate && pub_date < edate) {
        v.nworks = v.nworks + 1
      }
    })

  })

  var rscale = d3.scale.linear()
    .domain([d3.min(data,function(d){return d.nworks}),d3.max(data, function(d){return d.nworks})])
    .range([700,5500])
    .nice();

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
        .attr("transform",function(d){return "translate("+projection([d.organization.lng,d.organization.lat])+")scale("+projection.scale()+")"})
        .attr("class","bubble")

  bubbles.append("circle")
      .attr("fill",function(d) {return "blue"})
        
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
      .attr('r', function(d) { return Math.sqrt(rscale(d.nworks))/zoom.scale()})
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
        .attr("transform",function(d){return "translate("+projection([d.organization.lng,d.organization.lat])+")scale("+projection.scale()+")"})
        .attr("class","bubble")

    var c = enter.append("circle")
      .attr("fill",function(d) {return categories[d.category].color})
      .attr("r",1e-5)    
      .transition().duration(500)
      .attr("r", function(d) { return Math.sqrt(rscale(d.nworks))/zoom.scale()})
//      .attr("r", function(d) { return 5000/zoom.scale()})
      .append('svg:title')
      .text(function(d) { return d.name; });
  }

}