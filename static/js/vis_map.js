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
      //This assumes the entire schema is present; it will break in many cases since this doesnt not hold
      //for the entire dataset
      var d = data['orcid-profile'] 
      var works = d['orcid-activities']['orcid-works']['orcid-work']
      var oid = d['orcid-identifier']['path']
      var name = d['orcid-bio']['personal-details']['family-name'].value+', '+d['orcid-bio']['personal-details']['given-names'].value
      var employment = d['orcid-activities']['affiliations']['affiliation']

      $.each(employment,function(index,v) {
        var city = v['organization']['address']['city']
        var country = v['organization']['address']['country']
        var geocode_url = "https://maps.googleapis.com/maps/api/geocode/json?address="+city+'+,'+country

        //async:false just to not run into google public API problems.
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

  d3.select('body').append('div')
    .style('margin-left',width+50)
    .style('font-size','1.5em')
    .text(name)


  //Sanitization function in the case that day/month/year isn't in the schema
  //This is still way too fragile!
  var isEmpty = function (f) {
     if (f == null || f.value == null || f.value.trim() == '') 
       return true;
     return false;
  }
  var getDate = function (d) {
    if (d.hasOwnProperty('year')) {
      var year = d['year'].value || 0
    } else {
      var year = 0
    }

    if (d.hasOwnProperty('month')) {
      var month = isEmpty(d['month']) ? 0 : d['month'].value;
    } else {
      var month = 0
    }

    if (d.hasOwnProperty('day')) {
      var day = isEmpty(d['day']) ? 0 : d['day'].value;
    } else {
      var day = 0
    }

    return new Date(year,month,day)
  }

  var data = []
  var folding = {}

  $.each(employment, function(index,v){

    //TUM resolves to Munich correctly, but I'll override as Garching for display reasons
    if (v.organization.address.city == "Munchen") {
      v.organization.address.city = "Garching"
    }
    var name = v.organization.address.city + ', ' + v.organization.address.country
    if (v.hasOwnProperty('end-date')) {
      var edate = getDate(v['end-date'])
    }
    else {
      var edate = new Date()
    }
    var sdate = getDate(v['start-date'])
    if ( !folding.hasOwnProperty(name) ) {  
      data.push({
        'lat': v.organization.lat,
        'lng': v.organization.lng,
        'nworks':0,
        'city': v.organization.address.city,
        'country': v.organization.address.country,
        'name': name,
        'works': [],
      })
      folding[name] = []
    }
    folding[name].push({sdate:sdate,edate:edate})
  })

  //Since we've folded the affiliation data, we need to pick 
  //the start/end dates based on the earliest and latest dates from
  //the unfolded data
  $.each(folding,function(name,dates){
    $.each(data,function(index,v){
      if (name==v.name) {
        v.sdate = d3.min(dates,function(d){return d.sdate })
        v.edate = d3.max(dates,function(d){return d.edate })
      }
    })
  })

  //Increment publication data associated with each (folded) affiliation
  $.each(data,function(index,v){
    $.each(works,function(index,work){
      var pub_date = getDate(work['publication-date'])
      if (pub_date > v.sdate && pub_date < v.edate) {
        v.nworks = v.nworks + 1
        v.works.push(work['work-title'].title.value)
      }
    })
  })

  var rscale = d3.scale.linear()
    .domain([d3.min(data,function(d){return d.nworks}),d3.max(data, function(d){return d.nworks})])
    .range([500,4500])
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
        .attr("transform",function(d){return "translate("+projection([d.lng,d.lat])+")scale("+projection.scale()+")"})
        .attr("class","bubble")

  bubbles.append("circle")
      .attr("fill",function(d) {return "blue"})

  var tooltip = d3.selectAll("body")
    .append("div")
    .style('visibility','hidden')
    .style('margin-left',width+20)
    .style('font-size',"1.2em")
    .attr("class","tooltip")

  svg.call(zoom)
  zoomed()

  function zoomed() {
    var tiles = tile
        .scale(zoom.scale())
        .translate(zoom.translate())
        ();

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


    bubbleG
     .attr("transform",function(d){return "translate("+zoom.translate()+")scale("+zoom.scale()+")"})
        
    bubbleG
      .selectAll("circle")
      .attr('r', function(d) { return Math.sqrt(rscale(d.nworks))/zoom.scale()})
        .on("mouseover", function(d){
          d3.select(this).transition().duration(1000)
            .attr('fill','red')

          tooltip.style('visibility','visible')
          var t = d.works.join("<br>")
          tooltip.html(t)
        })
        .on("mouseout", function(d){
          d3.select(this).transition().duration(1000)
            .attr('fill','blue')
          tooltip.style('visibility','hidden')
        })     

  }

}