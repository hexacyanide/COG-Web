/*global
  $, async, debug, cog, util
*/

(function(window, document) {

  var log = debug('cog-web:page:history');
  var submit = $('button#submit').ladda();

  var uuid = null;
  var admin = false;

  $(document).ready(function() {
    log('page initialization process started');
    var select = $('select#assignment');

    async.waterfall([
      function(callback) {
        log('requesting unique identifier for current session from server');
        cog.getMyUniqueId(function(err, data) {
          callback(err, data.useruuid);
        });
      }, function(uuid, callback) {
        log('requesting user administrator state from server');
        cog.getMyIsadmin(function(err, data) {
          callback(err, { uuid, admin: data.isadmin });
        });
      }
    ], function(err, result) {
      uuid = result.uuid;
      admin = result.admin;

      if (admin) {
        log('user identified as administrator, showing `user` form field');
        $('#form_user').slideDown(300);

        // this field will cause errors if it marked `required` when hidden
        $('select#user').prop('required', true);
      }

      // fetch all the submittable assignments from the server
      cog.getAssignmentsSubmittable(function(err, data) {
        // now we have an array of assignment UUIDs
        var assignments = data.assignments;
        log('loaded %d assignment identifier(s) from the server', assignments.length);

        // inform the user if no assignments can be currently submitted
        if (!assignments.length) {
          var option = $('<option>').text('No Assignments Available');
          // only on initial load, no empty required
          select.append(option);
          return;
        }

        log('fetching metadata for individual assignments');
        async.map(assignments, cog.getAssignment.bind(cog), function(err, results) {
          log('received all assignment metadata from server');

          // after receiving all the assignment objects, clear the selector
          select.empty();
          log('populating assignment listing with received entries');
          populateAssignmentList(results);
        });
      });

    });
  });

  $('select#assignment').change(function() {
    var sel = $(this).find(':selected');
    var uuid = sel.val();
    var text = sel.text();

    var select = $('select#test');
    var users = $('select#user');

    log('assignment selector changed to `%s` (%s)', text, uuid.substring(0, 8));
    cog.getAssignmentTests(uuid, function(err, data) {
      // array of test UUIDs
      var tests = data.tests;

      log('loaded %d test options for assignment `%s`', tests.length, text);

      // inform the user if no tests are available
      if (!tests.length) {
        var option = $('<option>').text('No Tests Available');
        // empty previous assignment selection
        select.empty();
        select.append(option);
        // disable the test selector
        select.prop('disabled', true);

        // empty all previously loaded usernames
        users.empty();
        // disable the user selector
        users.prop('disabled', true);

        // remove the max score, as there is no specified test
        $('span#max-score').text(0);
        // disable the submit button
        $('button#submit').prop('disabled', true);
        return;
      }

      log('fetching metadata for individual tests');
      async.map(tests, cog.getTest.bind(cog), function(err, results) {
        log('received all test metadata from server');

        // after receiving all the test objects, clear the selector
        select.empty();
        log('populating test listing with received entries');
        populateTestList(results);
      });
    });
  });

  $('select#test').change(function() {
    var sel = $(this).find(':selected');
    var uuid = sel.val();
    var text = sel.text();
    log('test selector changed to `%s` (%s)', text, uuid.substring(0, 8));

    cog.getTest(uuid, function(err, data) {
      var keys = Object.keys(data);
      var uuid = keys[0];
      var test = data[uuid];

      // update the maximum possible score indicator
      $('span#max-score').text(test.maxscore);
      // enable the submit button
      $('button#submit').prop('disabled', false);

      // for non-administrators, stop execution here
      if (!admin) return;
      log('current user is of type administrator, loading usernames');

      cog.getUsersNamelist(function(err, data) {
        var usernames = data.usernames;
        var uuids = Object.keys(usernames);
        log('loaded %d username(s) from the server', uuids.length);

        populateUserList(usernames);
      });

    });
  });

  $('select#user').change(function() {
    var sel = $(this).find(':selected');
    var uuid = sel.val();
    var text = sel.text();
    log('user selector changed to `%s` (%s)', text, uuid.substring(0, 8));
  });

  $('form#submitform').submit(function(event) {
    event.preventDefault();

    // start the loading ticker and indicate that a search is in progress
    submit.ladda('start');
    $('button#submit').children('span.ladda-label').html('Searching...');

    var assignment = $('select#assignment').val();
    var test = $('select#test').val();
    var user = $('select#user').val();

    // create a attribute link for this search
    var hash = 'asn=' + assignment + '&tst=' + test + '&usr=' + user;
    window.location.hash = hash;

    // lock all form fields
    $('select#assignment').prop('disabled', true);
    $('select#test').prop('disabled', true);
    $('select#user').prop('disabled', true);

    // clear all entries loaded from previous queries
    $('#history-table tbody tr').remove();

    var getAssignmentSubmissions = admin ? cog.getUserAssignmentSubmissions.bind(cog, user)
                                         : cog.getMyAssignmentSubmissions.bind(cog);
    var getSubmissionRuns = admin ? cog.getUserSubmissionRuns.bind(cog, user)
                                  : cog.getMySubmissionRuns.bind(cog);

    if (admin) {
      log('currently viewing runs as administrator for user: `%s`', user.substring(0, 8));
    }

    log('requesting assignment submissions for assignment: %s', assignment.substring(0, 8));
    getAssignmentSubmissions(assignment, function(err, data) {
      // array of submission UUIDs
      var submissions = data.submissions;

      log('received %d submissions for assignment `%s`', submissions.length, assignment.substring(0, 8));

      if (!submissions.length) {
        submit.ladda('stop');
        $('button#submit').children('span.ladda-label').html('Search');

        $('select#assignment').prop('disabled', false);
        $('select#test').prop('disabled', false);
        $('select#user').prop('disabled', false);
        return;
      }

      log('fetching run listings for individual submissions (%d total)', submissions.length);
      async.map(submissions, getSubmissionRuns, function(err, results) {
        log('received all submission run listings from server');

        log('flattening all runs into single listing');
        var filter = results.filter(function(entry) {
          return entry.runs.length > 0;
        }).map(function(entry) {
          return entry.runs;
        });

        var runs = [].concat.apply([], filter);

        log('fetching metadata for individual run entries (%d total)', runs.length);
        async.map(runs, cog.getRun.bind(cog), function(err, results) {
          log('received all test metadata from server (took %s requests)', submissions.length + runs.length);

          // filter submissions by test UUID
          // this should really be done on the server side, but it's not
          var test = $('select#test').val();
          results = results.filter(function(entry) {
            var key = Object.keys(entry)[0];
            return entry[key].test === test;
          });

          log('populating results table with received entries');
          populateResultTable(results);
        });
      });

    });
  });

  function populateAssignmentList(list) {
    var elements = [];

    list.forEach(function(entry) {
      var uuid = Object.keys(entry)[0];
      var meta = entry[uuid];
      var option = $('<option>', { value: uuid }).text(meta.name);
      elements.push(option);
    });

    elements.sort(function(a, b) {
      var c = a.text().toLowerCase();
      var d = b.text().toLowerCase();

      if (c < d) return -1;
      if (c > d) return 1;
      return 0;
    });

    var str = elements.map(function(ele) {
      return ele.prop('outerHTML');
    }).join('');

    var select = $('select#assignment');
    select.html(str);
    select.prop('disabled', false);

    // select the last entry, as per old behavior
    // select.find('option:last').attr('selected', 'selected');
    // select.val(select.children('option:last').val());

    log('attempting to fetch run result record for %s', asn);
    // use the hash parameter if it's given
    var asn = util.getHashParameter('asn') || select.children('option:last').val();
    select.val(asn);
    select.change();
  }

  function populateTestList(list) {
    var elements = [];

    list.forEach(function(entry) {
      var uuid = Object.keys(entry)[0];
      var meta = entry[uuid];
      var option = $('<option>', { value: uuid }).text(meta.name);
      elements.push(option);
    });

    elements.sort(function(a, b) {
      var c = a.text().toLowerCase();
      var d = b.text().toLowerCase();

      if (c < d) return -1;
      if (c > d) return 1;
      return 0;
    });

    var str = elements.map(function(ele) {
      return ele.prop('outerHTML');
    }).join('');

    var select = $('select#test');
    select.html(str);
    select.prop('disabled', false);

    // select the last entry (assumed most recent)
    // select.val(select.children('option:last').val());

    // use the hash parameter if provided, otherwise use the last one
    var test = util.getHashParameter('tst') || select.children('option:last').val();
    select.val(test);
    select.change();
  }

  function populateUserList(map) {
    var elements = [];

    Object.keys(map).forEach(function(uuid) {
      var username = map[uuid];
      var option = $('<option>', { value: uuid }).text(username);
      elements.push(option);
    });

    elements.sort(function(a, b) {
      var c = a.text().toLowerCase();
      var d = b.text().toLowerCase();

      if (c < d) return -1;
      if (c > d) return 1;
      return 0;
    });

    var str = elements.map(function(ele) {
      return ele.prop('outerHTML');
    }).join('');

    var select = $('select#user');
    select.html(str);
    select.prop('disabled', false);

    // select the currently logged in user, or as specified by hash
    var usr = util.getHashParameter('usr') || uuid;
    log('attempting to fetch run result record for %s', usr);

    select.val(usr);
    select.change();
  }

  function populateResultTable(list) {
    var elements = [];

    list.forEach(function(entry) {
      var uuid = Object.keys(entry)[0];
      var meta = entry[uuid];

      elements.push({
        uuid,
        submission: meta.submission,
        assignment: meta.assignment,
        mtime: new Date(meta.modified_time * 1000),
        score: meta.score,
        status: meta.status,
        retcode: meta.retcode
      });
    });

    elements.sort(function(a, b) {
      return a.mtime - b.mtime;
    });

    var colors = {
      success: 'text-success',
      warning: 'text-warning',
      exception: 'text-danger',
      error: 'text-danger'
    };

    var str = elements.map(function(ele) {
      var submission = '<a href="/submission/?uuid=' + ele.submission + '">Files</a>';
      var run = '<a href="/run/?uuid=' + ele.uuid + '">Output</a>';

      var sub = ele.status.split('-');
      var color = (sub.length > 1) ? colors[sub[1]] : colors.success;

      return [
        '<tr><td>' + ele.mtime.toLocaleString() + '</td>',
        // '<td>' + ele.score + ' (' + ((ele.score / 60) * 100).toFixed(2) + '%)</td>',
        '<td>' + ele.score + '</td>',
        '<td>' + ((ele.score / 60) * 100).toFixed(2) + '%</td>',
        '<td>' + ele.retcode + '</td>',
        '<td class="' + color + '">' + ele.status + '</td>',
        '<td>' + submission + ' or ' + run + '</td></tr>'
      ].join('');
    }).join('');
    
    $('#history-table-contents').hide();
    $('#history-table').append(str);
    $('#history-table-contents').fadeIn(500);
    
    submit.ladda('stop');
    $('button#submit').children('span.ladda-label').html('Search');

    $('select#assignment').prop('disabled', false);
    $('select#test').prop('disabled', false);
    $('select#user').prop('disabled', false);
  }

})(window, document);
