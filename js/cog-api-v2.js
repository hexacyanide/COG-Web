---
---

(function(window, document) {

  var log = debug('cog-web:api-v2');

  function COG(options) {
    this.url = options.url;
    this.token = options.token;

    var sub = this.token ? this.token.substring(0, 8) : undefined;
    log('constructing new interface object instance with token %s', sub);
  }

  /* internals */

  COG.prototype._ajax = function(options, callback) {
    var self = this;
    // options.url = this.url + options.url;
    options.beforeSend = options.beforeSend || function(xhr) {
      var header = util.generateBasicAuth(self.token);
      xhr.setRequestHeader('Authorization', header);
    };

    return $.ajax(options).then(function(data, status, xhr) {
      callback(null, data, status, xhr);
    }, function(xhr, status, err) {
      callback(err, null, status, xhr);
    });
  };

  COG.prototype._binary = function(options, callback) {
    var header = util.generateBasicAuth(this.token);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', options.url, true);
    xhr.responseType = 'blob';
    xhr.setRequestHeader('Authorization', header);

    xhr.onload = function() {
      if (this.status === 200) {
        var blob = this.response;
        return callback(null, blob);
      }

      var e = new Error('Server returned unexpected status');
      callback(e);
    };

    xhr.send();
  };

  /* users */

  COG.prototype.getUsers = function(callback) {
    var endpoint = '/users/';
    var url = this.url + endpoint;
    log('dispatching request to `%s`', endpoint);
    return this._ajax({ url }, callback);
  };

  var token = $.cookie('cog_token');
  window.cog.v2 = new COG({ url: '{{ site.cog_api_url }}/v2', token });

})(window, document);
