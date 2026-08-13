# timesketch

> A sketch-based visual analytics tool for querying time series data.

## Getting Started

### Prerequisites

You need [git][git] to clone the repository.

You need a web server to run the application in development. [Python][python] has a simple web server.

### Clone Timesketch

Clone the timesketch repository using git:

```bash
git clone https://github.com/tdawgtimmy/intersketch
cd timesketch
```

If you want to call it something different on your local machine:

```bash
git clone https://github.com/tdawgtimmy/intersketch <your-project-name>
cd <your-project-name>
```

### Start the Web Server

A web server is required to run the application in development. Navigate to the root of the project and run:

```bash
# Python 2
python -m SimpleHTTPServer

# Python 3
python -m http.server
```

By default, the web server will listen on [http://localhost:8000][server]. To change the port, run:

```bash
# Python 2
python -m SimpleHTTPServer <port>

# Python 3
python -m http.server <port>
```

## Managing Dependencies

No special mechanism is used for dependencies; global scripts are being used. See `index.html` for an example of how to load a third party script from a CDN with a local fallback. Local copies of the scripts should be placed in `js/vendor/`.

### Scoping Using IIFEs

**I**mmediately **I**nvoked **F**unction **E**xpressions are used to scope the JavaScript code within a script file. This creates a closure in which functions, variables, etc. within the file will remain insulated from the global namespace unless deliberately exported to the `window` object. In addition, IIFEs can inject dependencies. For example, `js/timeline.js` injects `window`, `d3`, and `lodash` into the closure and then exports the `timeline` object:

```JavaScript
(function(global, d3, _) { // Create a function with the window, d3, and lodash injected as 'global', 'd3', and '_', respectively.
...
global.timeline = function() { // Export the timeline component.
...
})(window, window.d3, window._); // Immediately invoke the function, injecting from the global scope.
```

For more information on IIFEs, check out this [Medium post](https://medium.com/@vvkchandra/essential-javascript-mastering-immediately-invoked-function-expressions-67791338ddc6).

[git]: https://git-scm.com/
[python]: https://www.python.org/
[server]: http://localhost:8000
