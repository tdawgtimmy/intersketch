(function(global, timeline, d3, moment, _) {
  let startDate = new Date(2017,4,1);
  let endDate = new Date(2017,6,30);
  let strictIsoParse = d3.utcParse("%Y-%m-%dT%H:%M:%S.%L%Z");
  let div = d3.select("#timeline");
  let loaded_data = [];
  let seriesDomain = [0, 1];
  let distanceThreshold = 500;
  let queryByShape = false;
  let eventTypeDict = {
    "Snack Bolus": "snack",
    "Meal Bolus": "meal",
    "Carb Correction": "carb_correction",
    "Correction Bolus": "insulin_correction",
  };

  function load_event_data(events) {

    return events
        .filter(d =>
          d.hasOwnProperty('created_at') 
          && d.hasOwnProperty('eventType')
          && parseTime(d.created_at) >= startDate.getTime()
          && parseTime(d.created_at) <= endDate.getTime())
        .filter(d => Object.keys(eventTypeDict).includes(d.eventType))
        .map(d => ({
            date : moment.parseZone(mergeTimeFormat(d.created_at))
              .startOf("day")._d.toString(),
            x : extractTimeFromString(d.created_at),
            eventType : eventTypeDict[d.eventType]
          })
        );
  }

  function load_series_data(series) {

    return d3.nest()
      .key(d => d.date)
      .sortValues((a,b) => parseFloat(a.time) - parseFloat(b.time))
      .entries(
        series
        .filter(d =>
          d.hasOwnProperty('dateString') 
          && d.hasOwnProperty('sgv')
          && parseTime(d.dateString) >= startDate.getTime()
          && parseTime(d.dateString) <= endDate.getTime())
        .map(d => ({
            date : moment.parseZone(mergeTimeFormat(d.dateString))
              .startOf("day")._d,
            time : extractTimeFromString(d.dateString),
            value : +d.sgv    
          })    
        )
      )
      .map(group => ({
          date: group.key,
          curve: interpolate(group.values.map(
            d => ({x: d.time, y:d.value})))
        })
      //only return days that have close to a full 24 hours of data
      ).filter( group => d3.min(group.curve, d=> d.x) <= 1
        && d3.max(group.curve, d=> d.x) >= 23
      ).map(group => ({
          date: group.date,
          curve: group.curve
          //simple_curve: simplify(group.curve, .01, true)
        })
      )      
  }

  function parseTime(dateString) {

    return strictIsoParse(mergeTimeFormat(dateString)).getTime();
  }

  function mergeTimeFormat(dateString) {

    return dateString.replace(" ","T");
  }

  function extractTimeFromString(dateString) {
    return +dateString.substring(11,13) + dateString.substring(14,16)/60;
  }

  //function to find null y values that need to be interpolated
  function find_null_indices(d,i){

    //hardcoded 10 as a number that is unlikely to be real
    //based on manual introspection of data
    if(d.y <= 10 || d.y == null) {
      null_indices.push(i);
      return true;
    }
      return false;
  }

  //interpolate to replace 0 values
  function interpolate(series) {

    null_indices = [];
    series.filter(
      (d,i) => find_null_indices(d,i));
    validX = series.filter((d,i) => !null_indices.includes(i))
      .map(d => d.x);
    validY = series.filter((d,i) => !null_indices.includes(i))
      .map(d => d.y);
    missingX = series.filter((d,i) => null_indices.includes(i))
      .map(d => d.x);
    missingY = everpolate.linear(missingX, validX, validY);

    return series.map((d,i) => ({
          x : d.x,
          y : null_indices.includes(i)?missingY[null_indices.indexOf(i)]:d.y
    }))
  }

  //distance function for DTW
  distFunc = function(a, b) {
    return Math.pow(a-b, 2);
    //return Math.abs(a-b);
  };

  function roundForDTW(d) {
    return Math.round(d*10)/10.;
  }

  function getDistance(curve, sketch, threshold) {

    if(sketch.length < 3 || curve.length <3) {
      return false;
    }

    return (new DynamicTimeWarping(curve, sketch, distFunc)
      .getDistance()/ curve.length) <= threshold;
  }

  function calculateDTW(sketch, points){
    var mapDTW = {}
    var matches = [];
    //turn sketch into X:Y dict
    var mapSketch = {}
    sketch.forEach(d => mapSketch[roundForDTW(d[0])] = d[1]);

    const sketchNormalizer = (queryByShape?sketch[0][1]:0);

    //iterate through each curve
    //and find points in the curve with the same X
    //DTW library needs exact pairs
    Object.values(loaded_data[0].series)
    .filter(outer => 

      points.filter(p=>
        loaded_data[0].events
        .filter(e => e.date == outer.date)
        .filter(inner =>
          points.length == 0
          || (inner.eventType == p.type.value
            && inner.x >= p[0]-2 //2-hr window
            && inner.x <= p[0]+2
          )        
        ).length > 0
      ).length == points.length
    )
    .forEach(outer => {

      const coords = outer.curve
        .filter(inner => roundForDTW(inner.x) in mapSketch)
        .map(inner => ({
          curve: inner.y,
          sketch: mapSketch[roundForDTW(inner.x)]
        }));

      if(coords.length > 3) {

        const normalizer = queryByShape?coords[0].curve:0;   

        if(getDistance(
          coords.map(d => d.curve - normalizer),
          coords.map(d => d.sketch - sketchNormalizer),
          distanceThreshold)) {

          matches.push(outer.date);
        }
      }
    })

    return matches;
  }

function generate_cluster(sketch, points, bolCreateMultiple) {

  var matches = calculateDTW(sketch, points);

  if(bolCreateMultiple && matches.length > 0) {

    add_timeline(
      loaded_data[0].series.filter(
        d => matches.includes(d.date)
      ), 
      loaded_data[0].events.filter(
        d => matches.includes(d.date)
      ),
      sketch, 
      points,
      true);

    loaded_data[0].series = 
      loaded_data[0].series.filter(
        d => !matches.includes(d.date)
      );

    loaded_data[0].events = 
      loaded_data[0].events.filter(
        d => !matches.includes(d.date)
      );

    //reload main timeline
    call_timeline(0);

    //new timeline
    call_timeline(loaded_data.length-1);

  } else {

    loaded_data[0].series.forEach( d => {

      d.match = matches.includes(d.date);
    });

    call_timeline(0);
  }  
}

function add_timeline(series, events, sketch, points, smallMultiple) {

    loaded_data.push({
      series: series,
      events: events,
      sketch: sketch,
      points: points,
      timeline: build_timeline(smallMultiple),
      svg: div.append("svg")
        .attr("width", '100%')
        .attr("height", 300)
        .attr("id", "svg_"+loaded_data.length-1)
        .style("top", (loaded_data.length-1)*320)
    })
}

function build_timeline(smallMultiple) {

  // Create the main timeline component.
  return timeline()
    .margin({ top: 10, right: 200, left: 30, bottom: 30 })
    .padding({ top: 2 })
    .axis({ bottom: 'Hour of Day', left: 'Blood Glucose (mg/dL)' })
    .curve(d3.curveMonotoneX)
    .x(d => d.x)
    .y(d => d.y)
    .xDomain([0, 24])
    .yDomain([0, 400])
    .seriesDomain(seriesDomain)
    .seriesScheme(d3.interpolatePuBu)
    .seriesKey(s => seriesKeyAccessor(s))
    .seriesData(s => s.curve)
    .legendTitle('# of Days Ago')
    .legendCells(10)
    .smallMultiple(smallMultiple)
    .on('change', function(curve, points){
      //console.log('change', curve, points);
      loaded_data[0].sketch = curve;
      loaded_data[0].points = points;
      generate_cluster(curve, 
                      points.filter(p => !!p.type.value), 
                      false); // Only consider points that are an event type.
    })
    .on('modeChange', function(modeType, value){
      console.log('modeChange', modeType, value);
      if(modeType == 'threshold') {
        distanceThreshold = value;
      } else {
        queryByShape = value==1?true:false;
      }
      generate_cluster(loaded_data[0].sketch, 
                      loaded_data[0].points.filter(p => !!p.type.value), 
                      false); // Only consider points that are an event type.
    })    
    .on('sketchSave', function(curve, points){
      // console.log('sketchSave', curve, points);
      loaded_data[0].sketch = [];
      loaded_data[0].points = [];
      generate_cluster(curve, 
                      points.filter(p => !!p.type.value),
                      true);
    }); 
}  

  function call_timeline(timeline_num) {

    var data = loaded_data[timeline_num];

    data.svg
      .datum({
        series: data.series,
        events: data.events,
        sketch: data.sketch,
        points: data.points
      })
      .call(data.timeline);  
  }

  function getSeriesDomain(series) {
    return d3.extent(series.map(seriesKeyAccessor)).reverse();
  }

  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      loaded_data.forEach((d, i) => call_timeline(i));
    }, 150);
  });

  function getMaxDate(series) {
    return d3.max(series, s=> moment(s.date));
  }

  /****************
  LOAD DATA
  ****************/
  Promise.all([
    d3.json("static/treatments.json"),
    d3.json("static/entries.json")
  ])
  .then(([events, series]) => {

    var loaded_events = load_event_data(events);
    var loaded_series = load_series_data(series);
    dates_with_series = loaded_series.map(s => s.date);

    loaded_events = loaded_events.filter(
      e => dates_with_series.includes(e.date.toString())
    );

    return {events: loaded_events,
      series: loaded_series};
  })    
  .then(data => {

    let {events, series} = data;

    // Calculate the color domain.
    maxDate = getMaxDate(series);
    seriesKeyAccessor = function(s){ 
      return maxDate.diff(moment(s.date), 'days')
    };    
    seriesDomain = getSeriesDomain(series);

    add_timeline(series, events, [], [], false);

    // Render the main timeline component.
    call_timeline(0);
  });

})(window, window.timeline, window.d3, window.moment, window._);