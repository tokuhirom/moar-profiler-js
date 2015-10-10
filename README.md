# Analyzie MoarVM's profiler output on CLI.

nqp+MoarVM outputs profiler result as HTML. But hard to see on web browser. It's browser crasher.
The html contains JSON and angularjs based code.

In this repository, I copy and pasted js code in MoarVM's src/vm/moar/profiler/template.html.
And port it to CLI command.

# Usage

    npm install
    perl6-m --profile --profile-filename=output.json target.pl6
    node profile.js < output.json

